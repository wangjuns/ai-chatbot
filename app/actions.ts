'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { DocumentSnapshot, Firestore, QueryDocumentSnapshot } from '@google-cloud/firestore';

import { auth } from '@/auth'
import { type Chat } from '@/lib/types'

// Create a new client
const firestore = new Firestore();

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


export async function getChats(userId?: string | null) {
  if (!userId) {
    return []
  }

  try {
    const ref = firestore.collection('chat');
    const snapshot = await ref.where('userId', '==', userId)
      .orderBy("createdAt", 'desc')
      .limit(30)
      .get();


    if (snapshot.empty) {
      console.log('No matching documents.');
      return;
    }
    const chats = snapshot.docs.map(doc => { return readChat(doc) });

    // console.log("chats: ", JSON.stringify(chats))

    return chats as Chat[]
  } catch (error) {
    console.error(error)
    return []
  }
}

export async function getChat(id: string, userId: string) {
  const chat = await firestore.collection('chat').doc(id).get()

  if (!chat.exists || (userId && chat.data()!.userId !== userId)) {
    return null
  }

  return chat.data() as Chat;
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

  //TODO do nothings now.

  revalidatePath('/')
  return redirect('/')
}

export async function getSharedChat(id: string) {
  const ref = firestore.collection('chat').doc(id);

  const chat = readChat((await ref.get()))

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

  return { ...chat, sharePath: `/share/${chat.id}` }
}

export async function saveChat(chat: Chat) {
  const session = await auth()

  if (session && session.user) {
    try {
      await firestore.collection('chat').doc(chat.id).set(chat)
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
