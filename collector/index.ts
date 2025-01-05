// fetchTweets.ts

import { config } from 'dotenv';

// Load environment variables from .env file
config();

const token: string | undefined = process.env.BEARER_TOKEN;


async function getLatestTweets() {
    const url = `https://api.twitter.com/2/tweets/search/recent?query=%40robet_ai&max_results=100`;

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
            }
        });

        if (!response.ok) {
            const errorDetail = await response.text();
            throw new Error(`Error ${response.status}: ${response.statusText}\n${errorDetail}`);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        if (error instanceof Error) {
            console.error(`Error fetching latest tweets: ${error.message}`);
        } else {
            console.error('An unknown error occurred while fetching tweets.');
        }
        throw error;
    }
}
