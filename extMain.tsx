/// <reference path="./node_modules/@types/chrome/index.d.ts" />
import preact from "preact";
import { isInBrowser, isInServiceWorker } from "./src/helpers";
import { HOT_RELOAD_PORT } from "./consts";
import { addMorePages } from "./src/addMorePages";



if (isInBrowser()) {
    window.process = {
        env: {
        }
    } as any;
}

if (isInBrowser()) {
    // NOTE: This run in production, which causes to try to connect to a random websocket. HOWEVER,
    //  1, we don't do anything with it (if it fails, etc, it won't break anything, and 2, it is no
    //  less harmless than any of the dozens of blocked tracking requests. Failed requests are FAST.
    const socket = new WebSocket(`ws://localhost:${HOT_RELOAD_PORT}`);

    socket.onmessage = function (event) {
        if (event.data === "Build completed successfully") {
            location.reload();
        }
    };

    async function main() {
        await addMorePages();
    }
    main().catch(console.error);
}