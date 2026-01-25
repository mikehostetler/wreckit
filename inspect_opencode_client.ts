import { createOpencodeClient } from '@opencode-ai/sdk'; const client = createOpencodeClient({}); console.log(Object.keys(client)); console.log(Object.getPrototypeOf(client));
