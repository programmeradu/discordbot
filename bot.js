import { createClient } from '@supabase/supabase-js';
import { Client, GatewayIntentBits } from 'discord.js';
import 'dotenv/config';
import cron from 'node-cron';
import Parser from 'rss-parser';

const client = new Client({ 
  intents: [GatewayIntentBits.Guilds],
});

const parser = new Parser();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const FEED_URL = 'https://rss.app/feeds/ecbQGspmZ0jGoA6I.xml';
const CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;

client.once('ready', () => {
  console.log('Discord bot is ready!');
  
  cron.schedule('*/15 * * * *', async () => {
    try {
      await checkAndPostNewItems();
    } catch (error) {
      console.error('Error in cron job:', error);
    }
  });
});

async function checkAndPostNewItems() {
  try {
    const feed = await parser.parseURL(FEED_URL);
    const channel = await client.channels.fetch(CHANNEL_ID);

    if (!channel || !channel.isTextBased()) {
      console.error('Invalid channel');
      return;
    }

    // Fetch all existing posts
    const { data: existingPosts, error } = await supabase
      .from('posted_items')
      .select('guid');

    if (error) {
      console.error('Error fetching existing posts:', error);
      return;
    }

    const existingGuids = new Set(existingPosts.map(post => post.guid));

    for (const item of feed.items) {
      const tweetId = item.link.split('/').pop();

      if (!existingGuids.has(tweetId)) {
        console.log(`Posting new tweet: ${tweetId}`);
        // Post the link without an embed
        await channel.send(`Check out the new post by BlockWard:\n ${item.link}\n @everyone`);

        await supabase
          .from('posted_items')
          .insert({
            guid: tweetId,
            posted_at: new Date().toISOString(),
            url: item.link
          });

        // Add the new post to our set of existing GUIDs
        existingGuids.add(tweetId);

        await new Promise(resolve => setTimeout(resolve, 1000));
      } else {
        console.log(`Skipping existing tweet: ${tweetId}`);
      }
    }
  } catch (error) {
    if (error.response) {
      console.error('HTTP error:', error.response.status, error.response.statusText);
    } else if (error.request) {
      console.error('Network error:', error.message);
    } else {
      console.error('Error processing feed:', error);
    }
  }
}

async function cleanupOldPosts() {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { error } = await supabase
    .from('posted_items')
    .delete()
    .lt('posted_at', thirtyDaysAgo.toISOString());

  if (error) {
    console.error('Error cleaning up old posts:', error);
  } else {
    console.log('Old posts cleaned up successfully');
  }
}

// Call cleanupOldPosts function once a day
cron.schedule('0 0 * * *', cleanupOldPosts);

client.on('error', error => {
  console.error('Discord client error:', error);
});

client.login(process.env.DISCORD_BOT_TOKEN);

