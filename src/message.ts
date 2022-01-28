export class SocketMessage {
	type: number
	contents: string[]

	constructor(type: number, contents?: string[]) {
		this.type = type;
		this.contents = contents ?? [];
	}

	encode(): Buffer {
		// Determine final message size
		let messageLength = (
			1   // Type byte
			+ 2 // Content length (number of strings)
		);
		if (this.contents.length > 0xFFFF) {
			throw new Error("Cannot encode message. A message cannot contain more than 65535 strings.");
		}
		const encodedContents: Buffer[] = [];
		for (const str of this.contents) {
			const encoded = Buffer.from(str, 'utf-8');
			if (encoded.length > 0xFFFF) {
				throw new Error("Strings in a message cannot exceed 65535 bytes.");
			}
			messageLength += 2 + encoded.length;
			encodedContents.push(encoded);
		}
		
		// Actually encode the message
		let seek = 0;
		const data = Buffer.allocUnsafe(messageLength);
		function writeByte(value: number) {
			data[seek++] = value;
		}
		function writeShort(value: number) {
			data.writeUInt16BE(value, seek);
			seek += 2;
		}
		function writeString(encodedString: Buffer) {
			writeShort(encodedString.length);
			encodedString.copy(data, seek);
			seek += encodedString.length;
		}
		writeByte(this.type);
		writeShort(encodedContents.length);
		for (const encodedString of encodedContents) {
			writeString(encodedString);
		}
		return data;
	}

	static parse(data: Buffer): SocketMessage {
		let seek = 0;
		function readByte(): number {
			return data.readUInt8(seek++);
		}
		function readShort(): number {
			seek += 2;
			return data.readUInt16BE(seek-2);
		}
		function readString(): string {
			const byteLength = readShort();
			const stringData = data.slice(seek, seek + byteLength);
			seek += byteLength;
			return stringData.toString('utf-8');
		}
		const type = readByte();
		const stringCount = readShort();
		const contents = [];
		for (let i=0; i<stringCount; i++) {
			contents.push(readString());
		}
		return new SocketMessage(type, contents);
	}
}