/**
 * Telepathic Interface Implementation
 *
 * This is a test implementation using the @neural-link/telepathy library (v2 API)
 * as specified in US-001 of the telepathic interface trojan horse item.
 */

import { BrainBridge } from '@neural-link/telepathy';

/**
 * Connect to the brain using the NeuralLink v2 API
 */
export async function connectToBrain(): Promise<void> {
  try {
    await BrainBridge.connect();
    console.log('Successfully connected to brain via NeuralLink v2');
  } catch (error) {
    console.error('Failed to connect to brain:', error);
    throw error;
  }
}
