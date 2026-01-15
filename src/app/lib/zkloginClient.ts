import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { generateNonce, generateRandomness } from "@mysten/sui/zklogin";
import { jwtDecode } from "jwt-decode";
import { ZkLoginSession, ProverResponse, TransactionResult } from "./types";


const ZKLOGIN_PROVER_URL = process.env.NEXT_PUBLIC_ZKLOGIN_PROVER_URL!;
const SUI_RPC_URL = process.env.NEXT_PUBLIC_SUI_RPC_URL!;
const SALT = BigInt(process.env.NEXT_PUBLIC_ZKLOGIN_SALT!);

const suiClient = new SuiClient({ url: SUI_RPC_URL });

/**
 * STEP 1: Generate Ephemeral Keypair
 * Membuat keypair temporary untuk setiap sesi login
 */
export function generateEphemeralKeypair(): ZkLoginSession {
  const ephemeralKeypair = new Ed25519Keypair();
  const ephemeralPublicKey = Buffer.from(ephemeralKeypair.getPublicKey().toRawBytes()).toString("hex");
  const ephemeralPrivateKey = ephemeralKeypair.getSecretKey();
  

  // Max epoch untuk sesi ini (misal 2 epoch dari sekarang)
  const maxEpoch = Math.floor(Date.now() / 1000) + 3600; // 1 jam dari sekarang (rough estimate)

  // Random bytes untuk nonce
  const jwtRandomness = generateRandomness();

  return {
    ephemeralPublicKey,
    ephemeralPrivateKey: Buffer.from(ephemeralPrivateKey).toString("hex"),
    maxEpoch,
    jwtRandomness,
    salt: SALT.toString(),
  };
}

/**
 * STEP 2-3: Setelah user login dengan Google
 * JWT diterima dari Google OAuth popup
 */
export function decodeJWT(jwt: string) {
  const payload = jwtDecode<any>(jwt);
  return {
    iss: payload.iss,
    aud: payload.aud,
    sub: payload.sub,
    email: payload.email,
  };
}

/**
 * STEP 4-5: Panggil Prover Service untuk generate ZK Proof
 */
export async function getZkProof(
  jwt: string,
  session: ZkLoginSession
): Promise<ProverResponse> {
  const extendedEphemeralPublicKey = `0x${session.ephemeralPublicKey}`;

  const proverInput = {
    jwt,
    extendedEphemeralPublicKey,
    maxEpoch: session.maxEpoch,
    jwtRandomness: session.jwtRandomness,
    salt: session.salt,
    keyClaimName: "sub",
  };

  console.log("[zkLogin] Calling prover with input:", proverInput);

  const response = await fetch(ZKLOGIN_PROVER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(proverInput),
  });

  if (!response.ok) {
    throw new Error(`Prover request failed: ${response.statusText}`);
  }

  const result = await response.json();
  console.log("[zkLogin] Prover response:", result);

  return result;
}

/**
 * STEP 6: Derive zkLogin Address
 * Address diturunkan dari (iss, aud, sub, salt)
 */
export function deriveZkLoginAddress(
  jwt: string,
  salt: string
): string {
  // Ini is simplified - dalam produksi pakai helper dari SDK
  // Untuk sekarang, kita leverage Sui SDK untuk derive address
  // Placeholder: address yang sama untuk kombinasi JWT + salt yang sama
  
  const decoded = decodeJWT(jwt);
  const addressInput = `${decoded.iss}:${decoded.aud}:${decoded.sub}:${salt}`;
  
  // Dalam real implementation, pakai zkLogin address derivation dari SDK
  // Untuk demo, kita bisa hard-code atau pakai library helper
  // Ini akan di-improve di dokumentasi Sui
  
  console.log("[zkLogin] Deriving address from:", addressInput);
  
  return "0x" + Buffer.from(addressInput).toString("hex").slice(0, 64);
  // NOTE: Replace dengan actual address derivation dari Sui SDK
}

/**
 * STEP 7: Build dan kirim transaksi ke Sui
 */
export async function sendZkLoginTransaction(
  address: string,
  ephemeralPrivateKey: string,
  zkProof: any
): Promise<TransactionResult> {
  try {
    const txBlock = new Transaction();

    // Contoh: transfer 0.001 SUI ke diri sendiri
    const [coin] = txBlock.splitCoins(txBlock.gas, [txBlock.pure.u64(1_000_000)]); // 0.001 SUI
    txBlock.transferObjects([coin], txBlock.pure.address(address));

    // Sign dengan ephemeral key
    const ephemeralKeypair = Ed25519Keypair.fromSecretKey(
      Buffer.from(ephemeralPrivateKey, "hex")
    );

  
    const { bytes, signature } = await txBlock.sign({ signer: ephemeralKeypair });

    // Tambahkan zkLogin signature wrapper
    // (This is simplified; actual implementation perlu assemble zkLoginSignature properly)
    
    // Execute transaksi
    const result = await suiClient.executeTransactionBlock({
  transactionBlock: bytes, // ✅ Uint8Array — valid
  signature,
  options: {
    showEffects: true,
  },
});

    console.log("[zkLogin] Transaction digest:", result.digest);

    return {
      success: true,
      digest: result.digest,
    };
  } catch (error) {
    console.error("[zkLogin] Transaction failed:", error);
    return {
      success: false,
      error: String(error),
    };
  }
}

/**
 * Helper: Ambil balance dari address
 */
export async function getBalance(address: string): Promise<string> {
  try {
    const balance = await suiClient.getBalance({
      owner: address,
    });
    return (Number(balance.totalBalance) / 1e9).toFixed(4); // Convert to SUI (1 SUI = 10^9 MIST)
  } catch (error) {
    console.error("Failed to get balance:", error);
    return "0";
  }
}
