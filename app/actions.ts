'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { DocumentSnapshot, Firestore, QueryDocumentSnapshot } from '@google-cloud/firestore';

import { auth } from '@/auth'
import { type Chat } from '@/lib/types'
import { LRUCache } from 'lru-cache'
import { logger } from '@/lib/logger';

// Create a new client
const firestore = new Firestore();

const options = {
  max: 50000,
}

const cache = new LRUCache(options)
let chatsCached = false;

function readChat(snapshot: QueryDocumentSnapshot | DocumentSnapshot): Chat | undefined {
  if (!snapshot.data()) {
    return undefined;
  }
  const { id, title, userId, path, messages, sharePath, createdAt } = snapshot.data()!;
  return {
    id,
    title,
    createdAt: createdAt?.toDate(),
    userId,
    path,
    messages,
    sharePath,
  } as Chat;
}

async function getChatsFromCache(userId: string) {
  const chatIds = cache.get(`${userId}_chats`) as string[] | undefined;
  if (chatIds === undefined) {
    return undefined;
  }

  logger.debug("cached chats: " + chatIds)

  return Promise.all(chatIds.map(id => getChatWithCache(id)));
}


export async function getChats(userId?: string | null) {
  if (!userId) {
    return []
  }

  const cached = await getChatsFromCache(userId!);
  if (cached != undefined) {
    return cached;
  }


  try {
    const ref = firestore.collection('chat');
    const snapshot = await ref.where('userId', '==', userId)
      .orderBy("createdAt", 'desc')
      .limit(10)
      .get();


    if (snapshot.empty) {
      console.log('No matching documents.');
      return;
    }

    const chats = snapshot.docs.map(doc => {
      const c = readChat(doc);
      if (c) {
        logger.debug("populate cache. " + c.id);
        cache.set(c.id, c);
      }
      return c;
    });

    cache.set(`${userId}_chats`, chats.map(c => c!.id))
    // console.log("chats: ", JSON.stringify(chats))

    return chats as Chat[]
  } catch (error) {
    console.error(error)
    return []
  }
}

async function getChatWithCache(id: string): Promise<Chat> {
  const cached = cache.get(id);
  if (cached != undefined) {
    logger.debug("read chat from cache: " + id);
    return cached as Chat;
  }
  logger.debug("cache missing: " + id);
  const snap = await firestore.collection('chat').doc(id).get()

  const chat = snap.data() as Chat;
  if (chat) {
    logger.debug("populate cache. " + chat.id);
    cache.set(chat.id, chat);
  }
  return chat;
}

export async function getChat(id: string, userId: string) {
  const chat = await getChatWithCache(id);

  if (!chat || (userId && chat!.userId !== userId)) {
    return null
  }

  return chat;
}

export async function removeChat({ id, path }: { id: string; path: string }) {
  const session = await auth()

  if (!session) {
    return {
      error: 'Unauthorized'
    }
  }


  const ref = firestore.collection('chat').doc(id);
  const chat = (await ref.get()).data()


  //Convert uid to string for consistent comparison with session.user.id

  if (chat) {
    const uid = chat.userId;

    if (uid !== session?.user?.id) {
      return {
        error: 'Unauthorized'
      }
    }
    cache.delete(id);
    cache.delete(`${uid}_chats`) //Simply delete chats cached


    await ref.delete();
  }
  revalidatePath('/')
  return revalidatePath(path)
}

export async function clearChats() {
  const session = await auth()

  if (!session?.user?.id) {
    return {
      error: 'Unauthorized'
    }
  }

  cache.clear()

  //TODO do nothings now.

  revalidatePath('/')
  return redirect('/')
}

export async function getSharedChat(id: string) {

  const chat = await getChatWithCache(id);

  if (!chat || !chat.sharePath) {
    return null
  }

  return chat
}

export async function shareChat(id: string) {
  const session = await auth()

  if (!session?.user?.id) {
    return {
      error: 'Unauthorized'
    }
  }

  const ref = firestore.collection('chat').doc(id);
  const chat = readChat((await ref.get()))

  if (!chat || chat.userId !== session.user.id) {
    return {
      error: 'Something went wrong'
    }
  }

  await ref.update({ sharePath: `/share/${chat.id}` })
  cache.set(id, chat)

  return { ...chat, sharePath: `/share/${chat.id}` }
}

export async function saveChat(chat: Chat) {
  const session = await auth()

  if (session && session.user) {
    try {
      await firestore.collection('chat').doc(chat.id).set(chat)
      cache.set(chat.id, chat);
    } catch (error) {
      console.error('Error writing document: ', error);
    }
  } else {
    return
  }
}

export async function refreshHistory(path: string) {
  redirect(path)
}

export async function getMissingKeys() {
  const keysRequired = ['OPENAI_API_KEY']
  return keysRequired
    .map(key => (process.env[key] ? '' : key))
    .filter(key => key !== '')
}
