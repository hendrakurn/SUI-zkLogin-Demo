"use client";
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import {
    genAddressSeed,
    generateNonce,
    generateRandomness,
    getExtendedEphemeralPublicKey,
    getZkLoginSignature,
    jwtToAddress,
} from "@mysten/sui/zklogin";
import { NetworkName, makePolymediaUrl, requestSuiFromFaucet, shortenAddress } from "@polymedia/suitcase-core";
import { LinkExternal, isLocalhost } from "@polymedia/suitcase-react";
import { jwtDecode } from "jwt-decode";
import { useEffect, useRef, useState } from "react";

const NETWORK: NetworkName = "devnet";
const MAX_EPOCH = 2;

const suiClient = new SuiClient({
    url: getFullnodeUrl(NETWORK),
});

type OpenIdProvider = "Google" | "Twitch" | "Facebook";

type SetupData = {
    provider: OpenIdProvider;
    maxEpoch: number;
    randomness: string;
    ephemeralPrivateKey: string;
};

type AccountData = {
    provider: OpenIdProvider;
    userAddr: string;
    zkProofs: any;
    ephemeralPrivateKey: string;
    userSalt: string;
    sub: string;
    aud: string;
    maxEpoch: number;
};

const setupDataKey = "zklogin-demo.setup";
const accountDataKey = "zklogin-demo.accounts";

export default function Test() {
    return <div>Tbhdfest</div>;
}
