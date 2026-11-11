import path from 'node:path';
import {pathToFileURL} from 'node:url';
const [root, gamePort, bridgePort] = process.argv.slice(2);
const {startBridge} = await import(pathToFileURL(path.join(root, 'tikfinity-bridge.mjs')).href);
startBridge({root, gameUrl:`http://127.0.0.1:${Number(gamePort)}`, port:Number(bridgePort)});
