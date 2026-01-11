# Sui zkLogin Demo

Projek ini adalah demonstrasi implementasi **zkLogin (Zero Knowledge Login)** pada blockchain **Sui** menggunakan framework **Next.js**. Aplikasi ini memungkinkan pengguna untuk login menggunakan akun Google mereka, menghasilkan Zero-Knowledge Proof (ZK Proof), dan melakukan transaksi di jaringan Sui tanpa perlu mengelola private key secara langsung.

## Fitur Utama

*   **Google Login Integration**: Menggunakan OpenID Connect (OAuth 2.0) untuk autentikasi pengguna via Google.
*   **zkLogin Implementation**:
    *   Membuat *ephemeral keypair* untuk sesi login.
    *   Menghasilkan ZK Proof menggunakan Prover Service.
    *   Mendapatkan alamat Sui yang diturunkan dari JWT dan Salt.
*   **Transaksi Blockchain**:
    *   Menampilkan saldo SUI (Devnet).
    *   Mengirim transaksi sederhana (transfer SUI) menggunakan zkLogin signature.
    *   Fitur Faucet integrasi untuk mendapatkan token SUI testnet.
*   **State Management**: Menyimpan sesi login secara lokal untuk persistensi sederhana.

## Teknology Stack

*   **Framework**: [Next.js 15+](https://nextjs.org/) (App Directory)
*   **Blockchain SDK**: [`@mysten/sui`](https://www.npmjs.com/package/@mysten/sui.js) & [`@mysten/sui/zklogin`](https://sdk.mystenlabs.com/typescript/zklogin)
*   **UI Components**: React, Tailwind CSS (via `@polymedia/suitcase-react`)
*   **Utilities**: [`@polymedia/suitcase-core`](https://github.com/juzybits/polymedia-suitcase)

## Prasyarat

Sebelum memulai, pastikan Anda memiliki:

*   [Node.js](https://nodejs.org/) (versi 18 atau lebih baru)
*   [npm](https://www.npmjs.com/) atau yarn/pnpm
*   Google Cloud Console Project (untuk mendapatkan Client ID)

## Cara Memulai (Setup)

Ikuti langkah-langkah berikut untuk menjalankan projek ini di komputer lokal Anda:

### 1. Clone Repository

```bash
git clone https://github.com/hendrakurn/SUI-zkLogin-Demo.git
cd zklogin-demo
```

### 2. Install Dependencies

Install semua library yang dibutuhkan:

```bash
#node module install
npm install

# Core blockchain & auth
npm install @mysten/sui @polymedia/suitcase-core @polymedia/suitcase-react jwt-decode

# Environment
npm install dotenv
```

### 3. Konfigurasi Client ID Google

Anda perlu mengatur Client ID Google agar fitur login berfungsi.

1.  Buka file `src/config.json`.
2.  Isi `CLIENT_ID_GOOGLE` dengan Client ID yang Anda dapatkan dari Google Cloud Console.

```json
{
    "URL_ZK_PROVER": "https://prover-dev.mystenlabs.com/v1",
    "URL_SALT_SERVICE": "/dummy-salt-service.json",
    "CLIENT_ID_GOOGLE": "YOUR_GOOGLE_CLIENT_ID_HERE"
}
```

### Cara Mendapatkan Google Client ID

Jika Anda belum memiliki Google Client ID, ikuti langkah-langkah detail berikut:

1.  **Buka Google Cloud Console**:
    Buka [https://console.cloud.google.com/](https://console.cloud.google.com/) dan login dengan akun Google Anda.

2.  **Buat Project Baru**:
    Klik dropdown project di bagian atas halaman, lalu klik **New Project**. Beri nama project Anda dan klik **Create**.

3.  **Konfigurasi OAuth Consent Screen**:
    *   Buka menu panel kiri, pilih **APIs & Services** > **OAuth consent screen**.
    *   Pilih **External** (untuk testing) dan klik **Create**.
    *   Isi informasi wajib: **App name**, **User support email**, dan **Developer contact information**.
    *   Klik **Save and Continue** melewati step lainnya.

4.  **Buat Credentials**:
    *   Pilih menu **Credentials** di panel kiri.
    *   Klik **+ CREATE CREDENTIALS** di bagian atas, pilih **OAuth client ID**.
    *   Pada **Application type**, pilih **Web application**.
    *   Beri nama pada **Name** (misal: "zkLogin Demo").

5.  **Setting URI (PENTING)**:
    *   Di bagian **Authorized JavaScript origins**, klik **ADD URI** dan masukkan:
        ```text
        http://localhost:3000
        ```
    *   Di bagian **Authorized redirect URIs**, klik **ADD URI** dan masukkan:
        ```text
        http://localhost:3000
        ```
    *   *Pastikan tidak ada slash di akhir URL (misal: http://localhost:3000/ salah).*

6.  **Dapatkan Client ID**:
    *   Klik **Create**.
    *   Akan muncul popup berisi **Your Client ID**.
    *   Salin string tersebut (biasanya berakhiran `.apps.googleusercontent.com`) dan tempel ke file `config.json` Anda.

### 4. Jalankan Aplikasi

Jalankan server development:

```bash
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000) di browser Anda.

## Struktur Folder

*   `src/app/page.tsx`: Halaman utama aplikasi (Frontend logic).
*   `src/app/lib/zkloginClient.ts`: Helper functions untuk logika zkLogin (generate keypair, get proof, dll).
*   `src/config.json`: File konfigurasi endpoint Prover dan Client ID.
*   `public/dummy-salt-service.json`: Simulasi service untuk mendapatkan salt (untuk dev/demo).

## Catatan Penting

*   **Network**: Secara default diatur ke **Sui Devnet**.
*   **Salt Service**: Projek ini menggunakan dummy salt service (file JSON statis) untuk kemudahan demo. Di produksi, Anda memerlukan *Salt Service* backend yang aman yang mengembalikan salt unik dan konsisten untuk setiap pengguna berdasarkan JWT mereka.

## Lisensi

Projek ini dibuat untuk tujuan edukasi dan demonstrasi.
