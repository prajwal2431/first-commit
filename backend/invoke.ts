import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config();

import { invokeRCAAgent } from './src/services/rca/rcaAgentClient';

async function main() {
    const prompt = process.argv[2] || "Why is revenue dropping?";

    console.log(`Invoking agent with prompt: "${prompt}"...`);

    try {
        const result = await invokeRCAAgent({
            prompt,
            orgId: "default", // or your tenantId
            sessionId: "manual-test-session",
        });

        console.log("\n--- Agent Result ---");
        console.log(result.result);

        if (result.reasoning_log) {
            console.log("\n--- Reasoning Log ---");
            console.log(JSON.stringify(result.reasoning_log, null, 2));
        }
    } catch (error: unknown) {
        if (error instanceof Error) {
            console.error("Failed to invoke agent:", error.message);
        } else {
            console.error("Failed to invoke agent:", String(error));
        }
    }
}

main();
