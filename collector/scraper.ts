/********************
 * scrapeTwitterStream.ts
 ********************/
import puppeteer from 'puppeteer';
import { spawn } from 'child_process';
import axios from 'axios';

/**
 * Parse total duration from all #EXTINF lines in an M3U8 string.
 */
function sumM3U8Duration(m3u8Content: string): number {
  let total = 0;
  const lines = m3u8Content.split('\n');
  for (const line of lines) {
    if (line.startsWith('#EXTINF:')) {
      // e.g. "#EXTINF:6.000,"
      const parts = line.split(':');
      if (parts.length > 1) {
        const durStr = parts[1].split(',')[0].trim(); // "6.000"
        const val = parseFloat(durStr);
        if (!isNaN(val)) {
          total += val;
        }
      }
    }
  }
  return total;
}

async function scrapeAndDownloadTwitterStream(tweetUrl: string, outputName: string) {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  // Collect all M3U8 URLs
  let foundM3u8Urls: string[] = [];

  await page.setRequestInterception(true);
  page.on('request', (req) => {
    if (req.url().includes('.m3u8')) {
      foundM3u8Urls.push(req.url());
      console.log('Found M3U8 stream URL:', req.url());
    }
    req.continue();
  });

  console.log(`Navigating to: ${tweetUrl}`);
  await page.goto(tweetUrl, { waitUntil: 'networkidle2', timeout: 60000 });

  // Small wait for extra .m3u8 requests
  await new Promise((resolve) => setTimeout(resolve, 2000));

  if (foundM3u8Urls.length === 0) {
    console.error('No M3U8 link found. Possibly DRM-protected or not a replay.');
    await browser.close();
    return;
  }

  // Grab cookies for FFmpeg requests
  const cookies = await page.cookies();
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');

  await browser.close();

  // 1) For each M3U8, fetch & parse #EXTINF durations. Keep track of the best (longest) one.
  let bestM3u8Url = '';
  let bestDuration = 0;

  for (const m3u8Url of foundM3u8Urls) {
    try {
      const resp = await axios.get<string>(m3u8Url, {
        headers: { Cookie: cookieHeader },
      });
      const dur = sumM3U8Duration(resp.data);
      console.log(`Duration for ${m3u8Url}: ~${dur.toFixed(1)}s`);
      if (dur > bestDuration) {
        bestDuration = dur;
        bestM3u8Url = m3u8Url;
      }
    } catch (err) {
      console.warn(`Failed to parse durations from ${m3u8Url}:`, err);
    }
  }

  if (!bestM3u8Url) {
    // If we failed to parse any durations at all, fallback to the last found M3U8
    bestM3u8Url = foundM3u8Urls[foundM3u8Urls.length - 1];
    console.log('Could not parse durations from any M3U8. Fallback to the last one found.');
  }

  console.log('Chosen M3U8 URL:', bestM3u8Url);
  console.log(`Best total duration: ~${bestDuration.toFixed(1)}s`);

  // 2) Construct ffmpeg args
  const outputFile = outputName;
  const ffmpegArgs = [
    '-headers',
    `Cookie: ${cookieHeader}`,
    '-i',
    bestM3u8Url,
    '-c',
    'copy',
    '-movflags',
    '+faststart',
  ];

  // 3) If we found a positive duration, use that + buffer. Otherwise fallback ~30 min.
  if (bestDuration > 0) {
    const forcedSeconds = Math.ceil(bestDuration + 5); // add 5s buffer
    ffmpegArgs.push('-t', String(forcedSeconds));
    console.log(
      `Forcing ffmpeg to stop after ~${forcedSeconds}s (sum of #EXTINF + 5s buffer).`
    );
  } else {
    // fallback if durations not found
    ffmpegArgs.push('-t', '60'); // 30 minutes
    console.log('Falling back to 30-minute limit. Increase -t if the broadcast is longer.');
  }

  ffmpegArgs.push(outputFile);

  console.log(`Downloading stream via ffmpeg to file: ${outputFile}\n`);

  const ffmpegProcess = spawn('ffmpeg', ffmpegArgs);

  ffmpegProcess.stdout.on('data', (data) => {
    console.log('ffmpeg stdout:', data.toString());
  });

  ffmpegProcess.stderr.on('data', (data) => {
    console.log('ffmpeg stderr:', data.toString());
  });

  ffmpegProcess.on('close', (code) => {
    console.log(`ffmpeg exited with code ${code}`);
  });
}

async function downloadTwitterSpace(spaceUrl: string, outputName: string) {
  console.log(`Starting download of Twitter Space: ${spaceUrl}`);

  return new Promise<void>((resolve, reject) => {
    const ytDlp = spawn("yt-dlp", [spaceUrl, "-o", outputName]);

    ytDlp.stdout.on("data", (data) => {
      console.log(`yt-dlp: ${data}`);
    });

    ytDlp.stderr.on("data", (data) => {
      console.error(`yt-dlp error: ${data}`);
    });

    ytDlp.on("close", (code) => {
      if (code === 0) {
        console.log(`Twitter Space downloaded successfully: ${outputName}`);
        resolve();
      } else {
        console.error(`yt-dlp process exited with code ${code}`);
        reject(new Error(`Failed to download Twitter Space. Exit code: ${code}`));
      }
    });
  });
}
