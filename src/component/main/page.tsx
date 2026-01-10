// src/app/page.tsx
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
import config from "@/config.json";

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
    const accounts = useRef<AccountData[]>([]);
    const [balances, setBalances] = useState<Map<string, number>>(new Map());
    const [modalContent, setModalContent] = useState<string | null>(null);
    const modalRef = useRef<HTMLDialogElement>(null);
    const [isLoaded, setIsLoaded] = useState(false); // <-- tambahkan state ini

    useEffect(() => {
        // Load accounts from session storage only after mount
        const savedAccounts = loadAccounts();
        accounts.current = savedAccounts;
        setIsLoaded(true);

        completeZkLogin();
        fetchBalances(accounts.current);
        const interval = setInterval(() => fetchBalances(accounts.current), 5_000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (modalContent && modalRef.current) {
            modalRef.current.showModal();
        } else if (!modalContent && modalRef.current) {
            modalRef.current.close();
        }
    }, [modalContent]);

    // Jangan panggil sessionStorage di top-level — pindahkan ke useEffect
    async function beginZkLogin(provider: OpenIdProvider) {
        setModalContent(`🔑 Logging in with ${provider}...`);

        const { epoch } = await suiClient.getLatestSuiSystemState();
        const maxEpoch = Number(epoch) + MAX_EPOCH;
        const ephemeralKeyPair = new Ed25519Keypair();
        const randomness = generateRandomness();
        const nonce = generateNonce(ephemeralKeyPair.getPublicKey(), maxEpoch, randomness);

        saveSetupData({
            provider,
            maxEpoch,
            randomness: randomness.toString(),
            ephemeralPrivateKey: ephemeralKeyPair.getSecretKey(),
        });

        const urlParams = new URLSearchParams({
            client_id: config.CLIENT_ID_GOOGLE,
            redirect_uri: window.location.origin, // "http://localhost:3000"
            response_type: "id_token",
            scope: "openid",
            nonce,
        });

        const loginUrl = `https://accounts.google.com/o/oauth2/v2/auth?${urlParams.toString()}`;
        console.log("GOOGLE LOGIN URL:", loginUrl);
        window.location.replace(loginUrl);
    }






    async function completeZkLogin() {
        console.log("HASH:", window.location.hash);
        const urlFragment = window.location.hash.substring(1);
        const urlParams = new URLSearchParams(urlFragment);
        const jwt = urlParams.get("id_token");
        if (!jwt) return;
        console.log("JWT from URL:", jwt);

        if (!jwt) return;

        window.history.replaceState(null, "", window.location.pathname);

        const jwtPayload = jwtDecode(jwt);
        if (!jwtPayload.sub || !jwtPayload.aud) {
            console.warn("[completeZkLogin] missing jwt.sub or jwt.aud");
            return;
        }

        const requestOptions =
            config.URL_SALT_SERVICE === "/dummy-salt-service.json"
                ? { method: "GET" }
                : {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ jwt }),
                };

        const saltResponse: { salt: string } | null = await fetch(
            config.URL_SALT_SERVICE,
            requestOptions
        )
            .then((res) => res.json())
            .catch((error) => {
                console.warn("[completeZkLogin] salt service error:", error);
                return null;
            });

        if (!saltResponse) return;

        const userSalt = BigInt(saltResponse.salt);

        const userAddr = jwtToAddress(jwt, userSalt);

        const setupData = loadSetupData();
        if (!setupData) {
            console.warn("[completeZkLogin] missing session storage data");
            return;
        }
        clearSetupData();
        for (const account of accounts.current) {
            if (userAddr === account.userAddr) {
                console.warn(`[completeZkLogin] already logged in with this ${setupData.provider} account`);
                return;
            }
        }

        const ephemeralKeyPair = keypairFromSecretKey(setupData.ephemeralPrivateKey);
        const ephemeralPublicKey = ephemeralKeyPair.getPublicKey();
        const payload = JSON.stringify({
            maxEpoch: setupData.maxEpoch,
            jwtRandomness: setupData.randomness,
            extendedEphemeralPublicKey: getExtendedEphemeralPublicKey(ephemeralPublicKey),
            jwt,
            salt: userSalt.toString(),
            keyClaimName: "sub",
        }, null, 2);

        console.debug("[completeZkLogin] Requesting ZK proof with:", payload);
        setModalContent("⏳ Requesting ZK proof. This can take a few seconds...");

        const zkProofs = await fetch(config.URL_ZK_PROVER, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: payload,
        })
            .then((res) => res.json())
            .catch((error) => {
                console.warn("[completeZkLogin] ZK proving service error:", error);
                return null;
            })
            .finally(() => {
                setModalContent(null);
            });

        if (!zkProofs) return;

        saveAccount({
            provider: setupData.provider,
            userAddr,
            zkProofs,
            ephemeralPrivateKey: setupData.ephemeralPrivateKey,
            userSalt: userSalt.toString(),
            sub: jwtPayload.sub,
            aud: typeof jwtPayload.aud === "string" ? jwtPayload.aud : jwtPayload.aud[0],
            maxEpoch: setupData.maxEpoch,
        });
    }

    async function sendTransaction(account: AccountData) {
        setModalContent("🚀 Sending transaction...");

        const tx = new Transaction();
        tx.setSender(account.userAddr);

        const ephemeralKeyPair = keypairFromSecretKey(account.ephemeralPrivateKey);
        const { bytes, signature: userSignature } = await tx.sign({
            client: suiClient,
            signer: ephemeralKeyPair,
        });

        const addressSeed = genAddressSeed(
            BigInt(account.userSalt),
            "sub",
            account.sub,
            account.aud,
        ).toString();

        const zkLoginSignature = getZkLoginSignature({
            inputs: {
                ...account.zkProofs,
                addressSeed,
            },
            maxEpoch: account.maxEpoch,
            userSignature,
        });

        await suiClient.executeTransactionBlock({
            transactionBlock: bytes,
            signature: zkLoginSignature,
            options: {
                showEffects: true,
            },
        })
            .then((result) => {
                console.debug("[sendTransaction] executeTransactionBlock response:", result);
                fetchBalances([account]);
            })
            .catch((error) => {
                console.warn("[sendTransaction] executeTransactionBlock failed:", error);
            })
            .finally(() => {
                setModalContent(null);
            });
    }

    function keypairFromSecretKey(privateKeyBase64: string): Ed25519Keypair {
        const keyPair = decodeSuiPrivateKey(privateKeyBase64);
        return Ed25519Keypair.fromSecretKey(keyPair.secretKey);
    }

    async function fetchBalances(accounts: AccountData[]) {
        if (accounts.length === 0) return;
        const newBalances = new Map<string, number>();
        for (const account of accounts) {
            const suiBalance = await suiClient.getBalance({
                owner: account.userAddr,
                coinType: "0x2::sui::SUI",
            });
            newBalances.set(
                account.userAddr,
                +suiBalance.totalBalance / 1_000_000_000
            );
        }
        setBalances((prevBalances) =>
            new Map([...prevBalances, ...newBalances])
        );
    }

    function saveSetupData(data: SetupData) {
        if (typeof window === 'undefined') return;
        sessionStorage.setItem(setupDataKey, JSON.stringify(data));
    }

    function loadSetupData(): SetupData | null {
        if (typeof window === 'undefined') return null;
        const dataRaw = sessionStorage.getItem(setupDataKey);
        if (!dataRaw) return null;
        const data: SetupData = JSON.parse(dataRaw);
        return data;
    }

    function clearSetupData(): void {
        if (typeof window === 'undefined') return;
        sessionStorage.removeItem(setupDataKey);
    }

    function loadAccounts(): AccountData[] {
        if (typeof window === 'undefined') return [];
        const dataRaw = sessionStorage.getItem(accountDataKey);
        if (!dataRaw) return [];
        const data: AccountData[] = JSON.parse(dataRaw);
        return data;
    }

    function saveAccount(account: AccountData): void {
        if (typeof window === 'undefined') return;
        const newAccounts = [account, ...accounts.current];
        sessionStorage.setItem(accountDataKey, JSON.stringify(newAccounts));
        accounts.current = newAccounts;
        fetchBalances([account]);
    }

    function clearState(): void {
        if (typeof window === 'undefined') return;
        sessionStorage.clear();
        accounts.current = [];
        setBalances(new Map());
    }

    const openIdProviders: OpenIdProvider[] = ["Google"];

    const GitHubLogo: React.FC = () => (
        <svg viewBox="0 0 98 96" xmlns="http://www.w3.org/2000/svg">
            <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M48.854 0C21.839 0 0 22 0 49.217c0 21.756 13.993 40.172 33.405 46.69 2.427.49 3.316-1.059 3.316-2.362 0-1.141-.08-5.052-.08-9.127-13.59 2.934-16.42-5.867-16.42-5.867-2.184-5.704-5.42-7.17-5.42-7.17-4.448-3.015.324-3.015.324-3.015 4.934.326 7.523 5.052 7.523 5.052 4.367 7.496 11.404 5.378 14.235 4.074.404-3.178 1.699-5.378 3.074-6.6-10.839-1.141-22.243-5.378-22.243-24.283 0-5.378 1.94-9.778 5.014-13.2-.485-1.222-2.184-6.275.486-13.038 0 0 4.125-1.304 13.426 5.052a46.97 46.97 0 0 1 12.214-1.63c4.125 0 8.33.571 12.213 1.63 9.302-6.356 13.427-5.052 13.427-5.052 2.67 6.763.97 11.816.485 13.038 3.155 3.422 5.015 7.822 5.015 13.2 0 18.905-11.404 23.06-22.324 24.283 1.78 1.548 3.316 4.481 3.316 9.126 0 6.6-.08 11.897-.08 13.526 0 1.304.89 2.853 3.316 2.364 19.412-6.52 33.405-24.935 33.405-46.691C97.707 22 75.788 0 48.854 0z"
                fill="#24292f"
            />
        </svg>
    );

    // Tampilkan loading sampai semua data siap
    if (!isLoaded) {
        return <div>Loading...</div>;
    }

    return (
        <div id='page'>
            <dialog
                ref={modalRef}
                onClose={() => setModalContent(null)}
            >
                {modalContent}
            </dialog>

            <div id="logos">
                <LinkExternal href="https://polymedia.app" follow={true}>
                    <img
                        alt="polymedia"
                        src="https://assets.polymedia.app/img/all/logo-nomargin-transparent-512x512.webp"
                        className="icon"
                    />
                </LinkExternal>

                <LinkExternal href="https://github.com/juzybits/polymedia-zklogin-demo" follow={true}>
                    <GitHubLogo />
                </LinkExternal>
            </div>

            <div id="network-indicator">
                <label>{NETWORK}</label>
            </div>

            <h1>Sui zkLogin demo</h1>

            <div id="login-buttons" className="section">
                <h2>Log in:</h2>
                {openIdProviders.map((provider) => (
                    <button
                        key={provider}
                        className={`btn-login ${provider}`}
                        onClick={() => beginZkLogin(provider)}
                    >
                        {provider}
                    </button>
                ))}
            </div>

            {accounts.current.length > 0 && (
                <div id="accounts" className="section">
                    <h2>Accounts:</h2>
                    {accounts.current.map((acct) => {
                        const balance = balances.get(acct.userAddr);
                        const explorerLink = makePolymediaUrl(NETWORK, "address", acct.userAddr);
                        return (
                            <div key={acct.userAddr} className="account">
                                <div>
                                    <label className={`provider ${acct.provider}`}>
                                        {acct.provider}
                                    </label>
                                </div>
                                <div>
                                    Address:{" "}
                                    <a
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        href={explorerLink}
                                    >
                                        {acct.userAddr}
                                    </a>
                                    <button
                                        className="btn-copy"
                                        onClick={() => {
                                            navigator.clipboard.writeText(acct.userAddr)
                                                .then(() => {
                                                    setModalContent("✅ Address copied to clipboard!");
                                                    setTimeout(() => setModalContent(null), 2000);
                                                })
                                                .catch(err => {
                                                    console.error('Failed to copy address:', err);
                                                    setModalContent("❌ Failed to copy address.");
                                                    setTimeout(() => setModalContent(null), 2000);
                                                });
                                        }}
                                        aria-label="Copy address"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                                        </svg>
                                    </button>
                                </div>
                                <div>User ID: {acct.sub}</div>
                                <div>Balance: {typeof balance === "undefined" ? "(loading)" : `${balance} SUI`}</div>
                                <button
                                    className={`btn-send ${!balance ? "disabled" : ""}`}
                                    disabled={!balance}
                                    onClick={() => sendTransaction(acct)}
                                >
                                    Send transaction
                                </button>
                                {balance === 0 && (
                                    <button
                                        className="btn-faucet"
                                        onClick={() => {
                                            requestSuiFromFaucet(NETWORK, acct.userAddr);
                                            setModalContent("💰 Requesting SUI from faucet. This will take a few seconds...");
                                            setTimeout(() => setModalContent(null), 3000);
                                        }}
                                    >
                                        Use faucet
                                    </button>
                                )}
                                <hr />
                            </div>
                        );
                    })}
                </div>
            )}

            <div className="section">
                <button
                    className="btn-clear"
                    onClick={() => clearState()}
                >
                    🧨 CLEAR STATE
                </button>
            </div>
        </div>
    );
}
