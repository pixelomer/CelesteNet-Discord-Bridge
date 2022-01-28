import { Client, Intents, TextBasedChannel, WebhookClient } from "discord.js";
import { SocketMessage } from "./message";
import colors from "colors";
import WebSocket from "ws";

function getEnv(key: string): string {
	const value = process.env[key];
	if (value == null) {
		console.log(`Missing environment variable ${key}`);
		process.exit(1);
	}
	return value;
}

const WEBHOOK_URL = getEnv("WEBHOOK_URL");
const BOT_TOKEN = getEnv("BOT_TOKEN");
const BRIDGE_CHANNEL_ID = getEnv("BRIDGE_CHANNEL_ID");

const webhookClient = new WebhookClient({
	url: WEBHOOK_URL
});
const client = new Client({
	intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES]
});
let ws: WebSocket;
let bridgeChannel: TextBasedChannel;
let didSendAMessage = false;

const recentlySentMessages = [];

const timeout = [ 2, 5, 10, 20, 30, 60 ];
let timeoutIndex = 0;
let connected = false;
function reconnectWebsocket() {
	try {
		ws.close();
	}
	catch {}
	ws = new WebSocket('ws://127.0.0.1:4422/');

	ws.on("message", (data: Buffer) => {
		const socketMessage = SocketMessage.parse(data);
		if (socketMessage.type === 0) {
			const content = socketMessage.contents[1];
			if (recentlySentMessages[0] === content) {
				recentlySentMessages.splice(0, 1);
				return;
			}
			webhookClient.send({
				content: content,
				username: socketMessage.contents[0].replace(/\:.*?\:/g, "").trim()
			});
			didSendAMessage = true;
		}
	});

	ws.on("open", () => {
		console.log("Connected to mod.");
		if (!connected) {
			bridgeChannel.send("Connected to CelesteNet.");
			didSendAMessage = true;
			connected = true;
		}
		timeoutIndex = 0;
	});

	ws.on("close", () => {
		const timeoutSec = timeout[timeoutIndex];
		console.log("Disconnected from mod. Retrying in", timeoutSec, "seconds.");
		setTimeout(() => reconnectWebsocket(), timeoutSec * 1000);
		if (timeoutIndex !== (timeout.length - 1)) {
			timeoutIndex++;
		}
		if (connected) {
			bridgeChannel.send("Disconnected from CelesteNet.");
			didSendAMessage = true;
			connected = false;
		}
	});

	ws.on("error", (err) => {
		console.log(colors.bold.red("Error:"), err.message);
	});
}

client.on("messageCreate", (message) => {
	if ((message.channelId === BRIDGE_CHANNEL_ID) && !message.author.bot) {
		const sendMessageRequest = new SocketMessage(1, [ message.content ]);
		recentlySentMessages.push(message.content);
		try {
			ws.send(sendMessageRequest.encode());
		}
		catch (err) {
			console.log(err);
		}
	}
});

client.on("ready", () => {
	reconnectWebsocket();
	//@ts-ignore
	bridgeChannel = client.channels.cache.get(BRIDGE_CHANNEL_ID);
});

process.on("SIGINT", async() => {
	if ((ws != null) && (ws.readyState === WebSocket.OPEN)) {
		ws.close();
	}
	if (didSendAMessage) {
		await bridgeChannel.send("CelesteNet bridge is shutting down.");
	}
	client.destroy();
	process.exit(0);
});

client.login(BOT_TOKEN);