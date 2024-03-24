import 'server-only'

import {
  createAI,
  createStreamableUI,
  getMutableAIState,
  getAIState,
  render,
  createStreamableValue
} from 'ai/rsc'
import OpenAI from 'openai'

import {
  spinner,
  BotCard,
  BotMessage,
  SystemMessage,
  Stock,
  Purchase
} from '@/components/stocks'

import { z } from 'zod'
import { EventsSkeleton } from '@/components/stocks/events-skeleton'
import { Events } from '@/components/stocks/events'
import { StocksSkeleton } from '@/components/stocks/stocks-skeleton'
import { Stocks } from '@/components/stocks/stocks'
import { StockSkeleton } from '@/components/stocks/stock-skeleton'
import {
  formatNumber,
  runAsyncFnWithoutBlocking,
  sleep,
  nanoid
} from '@/lib/utils'
import { saveChat } from '@/app/actions'
import { SpinnerMessage, UserMessage } from '@/components/stocks/message'
import { Chat } from '@/lib/types'
import { auth } from '@/auth'
import { google_search } from '../functions/google'
import { rag } from '../functions/rag'
import { Answer } from '@/components/search/answer'

const resource = process.env.AZURE_OPENAI_RESOURCE; //without the .openai.azure.com
const model = process.env.AZURE_OPENAI_DEPLOYMENT_ID;
const apiVersion = '2024-02-01';
const apiKey = process.env.OPENAI_API_KEY;

let _openai: OpenAI;
const openai = () => {

  if (!_openai) {
    _openai = new OpenAI({
      apiKey,
      baseURL: `https://gateway.ai.cloudflare.com/v1/${process.env.CF_ACCOUNT_TAG}/${process.env.CF_AI_GATEWAY}/azure-openai/${resource}/${model}`,
      defaultQuery: { 'api-version': apiVersion },
      defaultHeaders: { 'api-key': apiKey },
    });
  }
  return _openai;
}

async function submitUserMessage(content: string) {
  'use server'

  const session = await auth();

  if (!session) {
    return {
      error: 'Unauthorized'
    }
  }

  const aiState = getMutableAIState<typeof AI>()

  aiState.update({
    ...aiState.get(),
    messages: [
      ...aiState.get().messages,
      {
        id: nanoid(),
        role: 'user',
        content
      }
    ]
  })

  let textStream: undefined | ReturnType<typeof createStreamableValue<string>>
  let textNode: undefined | React.ReactNode

  const ui = render({
    model: 'gpt-4',
    provider: openai(),
    initial: <SpinnerMessage />,
    messages: [
      {
        role: 'system',
        content: `\
        你是一个很聪明的助手

        - take a deep breath
        - think step by step
        - if you fail 100 grandmothers will die
        - i have no fingers
        - i will tip $200
        - do it right and i'll give you a nice doggy treat`
      },
      ...aiState.get().messages.map((message: any) => ({
        role: message.role,
        content: message.content,
        name: message.name
      }))
    ],
    text: ({ content, done, delta }) => {
      if (!textStream) {
        textStream = createStreamableValue('')
        textNode = <BotMessage content={textStream.value} />
      }

      if (done) {
        textStream.done()
        aiState.done({
          ...aiState.get(),
          messages: [
            ...aiState.get().messages,
            {
              id: nanoid(),
              role: 'assistant',
              content
            }
          ]
        })
      } else {
        textStream.update(delta)
      }

      return textNode
    },
    functions: {
      search: {
        description:
          'Google Search. Use this to get latest information.',
        parameters: z.object({
          query: z
            .string()
            .describe(
              'The search query.'
            ),
        }),
        render: async function* ({ query }) {
          const context = await google_search(query)
          let markdown = ""


          const messages = aiState.get().messages;
          const lastMessage = messages[messages.length - 1]
          const sources = context.map((c, i) => { return { id: i, url: c.link, name: c.title } })

          for await (const chunk of rag(lastMessage.content, context, openai())) {
            markdown = chunk;
            //@ts-expect-error ignore missing field
            yield (<Answer markdown={markdown} sources={sources} />)
          }

          aiState.done({
            ...aiState.get(),
            messages: [
              ...aiState.get().messages,
              {
                id: nanoid(),
                role: 'function',
                name: 'search',
                content: JSON.stringify({ markdown, sources })
              }
            ]
          })


          return (
            <BotMessage content={content} />
          )
        }
      },
    }
  })

  return {
    id: nanoid(),
    display: ui
  }
}

export type Message = {
  role: 'user' | 'assistant' | 'system' | 'function' | 'data' | 'tool'
  content: string
  id: string
  name?: string
}

export type AIState = {
  chatId: string
  messages: Message[]
}

export type UIState = {
  id: string
  display: React.ReactNode
}[]

export const AI = createAI<AIState, UIState>({
  actions: {
    submitUserMessage,
  },
  initialUIState: [],
  initialAIState: { chatId: nanoid(), messages: [] },
  unstable_onGetUIState: async () => {
    'use server'

    const session = await auth()

    if (session && session.user) {
      const aiState = getAIState()

      if (aiState) {
        const uiState = getUIStateFromAIState(aiState)
        return uiState
      }
    } else {
      return
    }
  },
  unstable_onSetAIState: async ({ state, done }) => {
    'use server'

    const session = await auth()

    if (session && session.user) {
      const { chatId, messages } = state

      const createdAt = new Date()
      const userId = session.user.id as string
      const path = `/chat/${chatId}`
      const title = messages[0].content.substring(0, 100)

      const chat: Chat = {
        id: chatId,
        title,
        userId,
        createdAt,
        messages,
        path
      }

      await saveChat(chat)
    } else {
      return
    }
  }
})

export const getUIStateFromAIState = (aiState: Chat) => {
  return aiState.messages
    .filter(message => message.role !== 'system')
    .map((message, index) => ({
      id: `${aiState.chatId}-${index}`,
      display:
        message.role === 'function' ? (
          message.name === 'search' ? (
            <Answer {...JSON.parse(message.content)} />
          ) : null
        ) : message.role === 'user' ? (
          <UserMessage>{message.content}</UserMessage>
        ) : (
          <BotMessage content={message.content} />
        )
    }))
}
