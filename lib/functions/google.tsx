import {
    spinner,
    BotCard,
    BotMessage,
    SystemMessage,
    Stock,
    Purchase
} from '@/components/stocks'
import { StockSkeleton } from '@/components/stocks/stock-skeleton';

const SEARCH_ENDPOINT = "https://www.googleapis.com/customsearch/v1";
const REFERENCE_COUNT = '8';


export interface SearchItem {
    title: string,
    link: string,
    snippet: string,
    htmlSnippet: string,
    cacheId: string
}

/*
google search result item schema:

  {
    kind: 'customsearch#result',
    title: 'Lionel Richie - Hello (Official Music Video) - YouTube',
    htmlTitle: 'Lionel Richie - <b>Hello</b> (Official Music Video) - YouTube',
    link: 'https://www.youtube.com/watch?v=mHONNcZbwDY',
    displayLink: 'www.youtube.com',
    snippet: 'Nov 20, 2020 ... REMASTERED IN HD! Explore the music of Lionel Richie: https://lnk.to/LionelBestOf Watch more Lionel videos: https://lnk.to/LionelVevo Get ...',
    htmlSnippet: 'Nov 20, 2020 <b>...</b> REMASTERED IN HD! Explore the music of Lionel Richie: https://lnk.to/LionelBestOf Watch more Lionel videos: https://lnk.to/LionelVevo Get&nbsp;...',
    cacheId: 'Iol1aRwBp-8J',
    formattedUrl: 'https://www.youtube.com/watch?v=mHONNcZbwDY',
    htmlFormattedUrl: 'https://www.youtube.com/watch?v=mHONNcZbwDY',
    pagemap: { cse_thumbnail: [Array], metatags: [Array], cse_image: [Array] }
  },
*/



export async function google_search(query: string): Promise<SearchItem[]> {
    const params = {
        "key": process.env.CUSTOM_SEARCH_API_KEY!,
        "cx": process.env.CUSTOM_SEARCH_CX!,
        "q": query,
        "num": REFERENCE_COUNT,
    }

    try {
        const response = await fetch(`${SEARCH_ENDPOINT}?${new URLSearchParams(params).toString()}`);
        const data = await response.json();
        if (!('items' in data)) {
            console.error("google return wrong data");
            return [];
        }
        return data["items"].slice(0, REFERENCE_COUNT);
    } catch (error) {
        console.error('Error:', error);
        return [];
    }
}