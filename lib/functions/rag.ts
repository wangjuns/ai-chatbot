import OpenAI from "openai";
import { SearchItem } from "./google";

const rag_query_text = `
You are a large language AI assistant.You are given a user question, and please write clean, concise and accurate answer to the question.You will be given a set of related contexts to the question, each starting with a reference number like[[citation: x]], where x is a number.Please use the context and cite the context at the end of each sentence if applicable.

Your answer must be correct, accurate and written by an expert using an unbiased and professional tone.Please limit to 1024 tokens.Do not give any information that is not related to the question, and do not repeat.Say "information is missing on" followed by the related topic, if the given context do not provide sufficient information.

Please cite the contexts with the reference numbers, in the format[citation:x]. If a sentence comes from multiple contexts, please list all applicable citations, like[citation: 3][citation: 5].Other than code and specific names and citations, your answer must be written in the same language as the question.

Here are the set of contexts:

{context_text}

Remember, don't blindly repeat the contexts verbatim. And here is the user question:
`;


export async function* rag(query: string, context: SearchItem[], openai: OpenAI) {
    const context_text = context.map((c, i) => `[[citation:${i + 1}]] ${c['snippet']}`).join("\n\n");
    const system_prompt = rag_query_text.replace('{context_text}', context_text);
    let messages = [{ "role": "system", "content": system_prompt }];
    messages.push({ "role": "user", "content": query });
    // Ask Azure OpenAI for a streaming chat completion given the prompt
    const events = await openai.chat.completions.create(
        {
            model: "gpt-4",
            //@ts-expect-error ignore type check
            messages,
            stream: true,
            temperature: 0.8,
            max_tokens: 2048,
        }
    );

    const markdownParse = (text: string) => {
        return text
            .replace(/\[\[([cC])itation/g, "[citation")
            .replace(/[cC]itation:(\d+)]]/g, "citation:$1]")
            .replace(/\[\[([cC]itation:\d+)]](?!])/g, `[$1]`)
            .replace(/\[[cC]itation:(\d+)]/g, "[citation]($1)")
    };

    let content = "";

    for await (const chunk of events) {
        content += chunk.choices[0]?.delta?.content || '';
        yield markdownParse(content)
    }
}