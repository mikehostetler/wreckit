import type { Logger } from "../logging";

export interface JokeOptions {
  cwd?: string;
  verbose?: boolean;
}

interface Joke {
  setup: string;
  punchline: string;
}

const JOKES: Joke[] = [
  { setup: "Why do programmers prefer dark mode?", punchline: "Because light attracts bugs." },
  { setup: "Why do Java programmers wear glasses?", punchline: "Because they can't C#." },
  { setup: "How many programmers does it take to change a light bulb?", punchline: "None, that's a hardware problem." }
];

function getRandomJoke(): Joke {
  return JOKES[Math.floor(Math.random() * JOKES.length)];
}

export async function jokeCommand(
  options: JokeOptions,
  logger: Logger
): Promise<void> {
  const joke = getRandomJoke();
  logger.info(`🤣 ${joke.setup}`);
  logger.info(`   ${joke.punchline}`);
}
