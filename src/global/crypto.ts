
// Crypto
import { Buffer } from 'buffer'
import { KeypairAlgorithm, ChunkSize } from '~/global/variables';

interface exportedKeypair {
    privateKey: string
    publicKey: string
}

export async function generateIdentityKeypair(): Promise<CryptoKeyPair> {
    const keyPair = await window.crypto.subtle.generateKey(
        KeypairAlgorithm,
        true,
        ["deriveKey"]
    )
    return keyPair
}

export async function importKeypair(keyPair: exportedKeypair): Promise<CryptoKeyPair> {

    const privateKey = await crypto.subtle.importKey(
        'pkcs8',
        Buffer.from(keyPair.privateKey, 'base64'),
        KeypairAlgorithm,
        true,
        ['deriveKey', 'deriveBits']
    )

    const publicKey = await crypto.subtle.importKey(
        'spki',
        Buffer.from(keyPair.publicKey, 'base64'),
        KeypairAlgorithm,
        true,
        []
    )

    return { privateKey, publicKey }
}

export async function exportKeypair(keyPair: CryptoKeyPair): Promise<exportedKeypair> {
    return {
        publicKey: Buffer.from(await crypto.subtle.exportKey('spki', keyPair.publicKey)).toString('base64'),
        privateKey: Buffer.from(await crypto.subtle.exportKey('pkcs8', keyPair.privateKey)).toString('base64')
    }
}

export async function generateSessionKeyECDH(peerPublic: string, userPrivate: CryptoKey | undefined): Promise<CryptoKey> {

    if (!peerPublic) throw new Error("Contacts's public key not present. ECDHE failed")
    if (!userPrivate) throw new Error("User private key not loaded. ECDHE failed")

    const publicKey = await crypto.subtle.importKey(
        'spki',
        Buffer.from(peerPublic, 'base64'),
        KeypairAlgorithm,
        true,
        []
    )

    const sessionKey = await crypto.subtle.deriveKey(
        {
            name: KeypairAlgorithm.name,
            public: publicKey,
            namedCurve: KeypairAlgorithm.namedCurve
        } as any,
        userPrivate,
        {
            name: "AES-CBC",
            length: 256
        },
        true,
        ["encrypt", "decrypt"]
    )

    return sessionKey
}

export async function deriveKeyFromPassword(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
    // Derive Key from password using PBKDF2
    const keyMaterial = await crypto.subtle.importKey(
        "raw",
        Buffer.from(password),
        "PBKDF2",
        false,
        ["deriveBits", "deriveKey"],
    );

    return await crypto.subtle.deriveKey(
        {
            name: "PBKDF2",
            salt,
            iterations: iterations,
            hash: "SHA-256",
        },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"],
    );
}

export async function decrypt(sessionKey: CryptoKey, encryptedMessage: string): Promise<string> {

    if (!sessionKey) throw new Error("SessionKey isn't initialized. Please import your Identity Keys exported from you previous device.")

    const decryptedChunks: string[] = []
    const chunks = encryptedMessage.split(":")

    for (let i = 0; i < chunks.length; i += 2) {
        const iv = Buffer.from(chunks[i], 'base64')
        const cipherText = Buffer.from(chunks[i + 1], 'base64')
        const plainText = await crypto.subtle.decrypt({ name: "AES-CBC", iv: iv }, sessionKey, cipherText)
        decryptedChunks.push(Buffer.from(plainText).toString())
    }

    console.debug("decryptedChunks:", decryptedChunks.length)
    return decryptedChunks.join("")
}

export async function encrypt(sessionKey: CryptoKey, message: string): Promise<string> {

    if (!sessionKey) throw new Error("SessionKey isn't initialized. Please import your Identity Keys exported from you previous device.")

    const encryptedChunks: string[] = []
    const messageBuf = Buffer.from(message)

    for (let i = 0; i < messageBuf.length; i += ChunkSize) {
        const nextIndex = Math.min(messageBuf.length, i + ChunkSize)
        const iv = crypto.getRandomValues(new Uint8Array(16));
        const plainText = Buffer.from(messageBuf.subarray(i, nextIndex))
        const cipherText = await crypto.subtle.encrypt({ name: "AES-CBC", iv: iv }, sessionKey, plainText)
        encryptedChunks.push(Buffer.from(iv).toString("base64") + ":" + Buffer.from(cipherText).toString("base64"))
    }

    console.debug("encryptedChunks:", encryptedChunks.length)
    return encryptedChunks.join(":")
}