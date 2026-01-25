import { createOpencodeClient } from '@opencode-ai/sdk'; const client = createOpencodeClient({}); console.log(Object.getOwnPropertyNames(Object.getPrototypeOf(client.session)));
