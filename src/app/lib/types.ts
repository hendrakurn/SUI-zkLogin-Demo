// Type definitions untuk flow zkLogin
export interface ZkLoginSession {
  ephemeralPublicKey: string;
  ephemeralPrivateKey: string;
  maxEpoch: number;
  jwtRandomness: string;
  salt: string;
  jwt?: string;
  zkProof?: any;
  address?: string;
}

export interface ProverResponse {
  proof: string;
}

export interface TransactionResult {
  success: boolean;
  digest?: string;
  error?: string;
}
