import { config } from 'dotenv';

// Load environment variables from .env file
config();

const token: string = process.env.BEARER_TOKEN!;


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

function extractRobetTweets(tweets: any): Array<{ url: string, betQuestion: string }> {
    const extractedData: Array<{ url: string, betQuestion: string }> = [];

    tweets.data.forEach((tweet: any) => {
        const text = tweet.text;
        const match = text.match(/^ROBET\s+(https?:\/\/\S+)\s+(.*)$/i);

        if (match) {
            const url = match[1];
            const betQuestion = match[2];
            extractedData.push({ url, betQuestion });
        }
    });

    return extractedData;
}

// Call getLatestTweets and process the response
getLatestTweets()
    .then(tweets => {
        const robetTweets = extractRobetTweets(tweets);
        console.log('Extracted ROBET tweets:', robetTweets);
    })
    .catch(error => {
        console.error('Failed to fetch tweets:', error);
    });
