const { ethers } = require("ethers");
require("dotenv").config();
const readline = require("readline");

// ================================= KONFIGURASI =================================
const delayBetweenActions = 5000; // Jeda antar transaksi dalam milidetik
const delayBetweenWallets = 10000; // Jeda antar dompet dalam milidetik
const rpcUrl = "https://sepolia.drpc.org/";
const contractAddress = "0x87A3effB84CBE1E4caB6Ab430139eC41d156D55A";
const contractAbi = [
    "function encryptETH(address to) payable",
    "function decrypt(address to, uint128 value)",
    "function claimAllDecrypted()"
];
const RUN_INTERVAL_HOURS = 24; // Atur interval eksekusi otomatis dalam jam
// ==============================================================================


// Definisi warna untuk konsol
const colors = {
    green: '\x1b[92m',
    yellow: '\x1b[93m',
    red: '\x1b[91m',
    cyan: '\x1b[96m',
    white: '\x1b[97m',
    bold: '\x1b[1m',
    reset: '\x1b[0m',
    magenta: '\x1b[95m',
    blue: '\x1b[94m',
    gray: '\x1b[90m'
};

const logger = {
    info: (msg) => console.log(`${colors.cyan}[i] ${msg}${colors.reset}`),
    warn: (msg) => console.log(`${colors.yellow}[!] ${msg}${colors.reset}`),
    error: (msg) => console.log(`${colors.red}[x] ${msg}${colors.reset}`),
    success: (msg) => console.log(`${colors.green}[+] ${msg}${colors.reset}`),
    loading: (msg) => console.log(`${colors.magenta}[*] ${msg}${colors.reset}`),
    step: (msg) => console.log(`${colors.blue}[>] ${colors.bold}${msg}${colors.reset}`),
    critical: (msg) => console.log(`${colors.red}${colors.bold}[FATAL] ${msg}${colors.reset}`),
    summary: (msg) => console.log(`${colors.green}${colors.bold}[SUMMARY] ${msg}${colors.reset}`),
    banner: () => {
        const border = `${colors.blue}${colors.bold}╔═════════════════════════════════════════╗${colors.reset}`;
        const title = `${colors.blue}${colors.bold}║      🍉 19Seniman From Insider 🍉      ║${colors.reset}`;
        const bottomBorder = `${colors.blue}${colors.bold}╚═════════════════════════════════════════╝${colors.reset}`;
        console.log(`\n${border}`);
        console.log(`${title}`);
        console.log(`${bottomBorder}\n`);
    },
    section: (msg) => {
        const line = '─'.repeat(40);
        console.log(`\n${colors.gray}${line}${colors.reset}`);
        if (msg) console.log(`${colors.white}${colors.bold} ${msg} ${colors.reset}`);
        console.log(`${colors.gray}${line}${colors.reset}\n`);
    },
    countdown: (seconds) => {
        let remaining = seconds;
        const interval = setInterval(() => {
            process.stdout.write(`\r${colors.blue}[⏰] Menunggu ${remaining} detik sebelum eksekusi berikutnya...${colors.reset}`);
            remaining--;
            if (remaining < 0) {
                clearInterval(interval);
                process.stdout.write('\r' + ' '.repeat(50) + '\r'); // Hapus baris countdown
            }
        }, 1000);
    },
};


const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

/**
 * Fungsi untuk mengajukan pertanyaan ke pengguna.
 * @param {string} query Pertanyaan yang akan diajukan.
 * @returns {Promise<string>} Jawaban dari pengguna.
 */
const askQuestion = (query) => new Promise(resolve => rl.question(query, resolve));

/**
 * Fungsi untuk menunda eksekusi.
 * @param {number} ms Waktu tunda dalam milidetik.
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Fungsi untuk mendapatkan semua private key dari file .env.
 * @returns {string[]} Array berisi private key.
 */
const getPrivateKeys = () => {
    const keys = [];
    let i = 1;
    while (process.env[`PRIVATE_KEY_${i}`]) {
        keys.push(process.env[`PRIVATE_KEY_${i}`]);
        i++;
    }
    return keys;
};

// ============================ FUNGSI-FUNGSI UTAMA KONTRAK ============================

async function encrypt(contract, wallet, amount) {
    logger.loading(`Encrypting ${amount} ETH untuk ${wallet.address}...`);
    try {
        const amountToSend = ethers.parseEther(amount);
        const tx = await contract.encryptETH(wallet.address, { value: amountToSend });
        await tx.wait();
        logger.success(`Enkripsi berhasil! Tx: ${tx.hash}`);
    } catch (err) {
        logger.error(`Enkripsi gagal: ${err.message.slice(0, 100)}...`);
        throw err;
    }
}

async function decrypt(contract, wallet, amount) {
    logger.loading(`Decrypting ${amount} eETH untuk ${wallet.address}...`);
    try {
        // Asumsi jumlah eETH yang akan didekripsi sama dengan jumlah ETH yang dienkripsi
        const amountToDecrypt = ethers.parseEther(amount);
        const tx = await contract.decrypt(wallet.address, amountToDecrypt);
        await tx.wait();
        logger.success(`Dekripsi berhasil! Tx: ${tx.hash}`);
    } catch (err) {
        logger.error(`Dekripsi gagal: ${err.message.slice(0, 100)}...`);
        throw err;
    }
}

async function claim(contract) {
    logger.loading(`Mengklaim ETH yang telah didekripsi...`);
    try {
        const tx = await contract.claimAllDecrypted();
        await tx.wait();
        logger.success(`Klaim berhasil! Tx: ${tx.hash}`);
    } catch (err) {
        logger.error(`Klaim gagal: ${err.message.slice(0, 100)}...`);
        throw err;
    }
}
// ====================================================================================

/**
 * Fungsi inti yang menjalankan siklus penuh (Encrypt -> Decrypt -> Claim) untuk semua dompet.
 * @param {string} encryptAmount Jumlah ETH yang akan dienkripsi.
 * @param {number} cycleCount Jumlah siklus yang akan dijalankan per dompet.
 */
async function runSequentialCycle(encryptAmount, cycleCount) {
    const privateKeys = getPrivateKeys();
    if (privateKeys.length === 0) {
        logger.error("Tidak ada private key yang ditemukan di file .env.");
        return;
    }

    logger.info(`Menemukan ${privateKeys.length} dompet. Memulai siklus penuh (${cycleCount} kali) per dompet.`);
    const provider = new ethers.JsonRpcProvider(rpcUrl);

    for (let i = 0; i < privateKeys.length; i++) {
        logger.section(`Memproses Dompet ${i + 1}/${privateKeys.length}`);
        try {
            const wallet = new ethers.Wallet(privateKeys[i], provider);
            logger.info(`Alamat Dompet: ${wallet.address}`);
            const contract = new ethers.Contract(contractAddress, contractAbi, wallet);

            for (let j = 0; j < cycleCount; j++) {
                logger.loading(`Memulai siklus ${j + 1}/${cycleCount}...`);
                let cycleSuccess = true;

                // Langkah 1: Encrypt
                try {
                    logger.step("Langkah 1: Encrypt ETH");
                    await encrypt(contract, wallet, encryptAmount);
                    await sleep(delayBetweenActions);
                } catch (err) {
                    logger.error(`Langkah Encrypt gagal. Menghentikan siklus untuk dompet ini.`);
                    cycleSuccess = false;
                }

                // Langkah 2: Decrypt (hanya jika encrypt berhasil)
                if (cycleSuccess) {
                    try {
                        logger.step("Langkah 2: Decrypt eETH");
                        await decrypt(contract, wallet, encryptAmount);
                        await sleep(delayBetweenActions);
                    } catch (err) {
                        logger.error(`Langkah Decrypt gagal. Menghentikan siklus untuk dompet ini.`);
                        cycleSuccess = false;
                    }
                }

                // Langkah 3: Claim (hanya jika decrypt berhasil)
                if (cycleSuccess) {
                    try {
                        logger.step("Langkah 3: Claim ETH");
                        await claim(contract);
                    } catch (err) {
                        logger.error(`Langkah Claim gagal.`);
                        cycleSuccess = false;
                    }
                }

                if (!cycleSuccess) {
                    break; // Keluar dari loop siklus jika ada langkah yang gagal
                }

                logger.success(`Siklus ${j + 1} selesai dengan sukses.`);
                if (j < cycleCount - 1) {
                    await sleep(delayBetweenActions); // Jeda antar siklus jika ada lebih dari satu
                }
            }
        } catch (walletError) {
            logger.error(`Terjadi kesalahan kritis pada dompet ${i + 1}. Lanjut ke dompet berikutnya.`);
        }

        if (i < privateKeys.length - 1) {
            logger.loading(`Menunggu ${delayBetweenWallets / 1000} detik sebelum memulai dompet berikutnya...`);
            await sleep(delayBetweenWallets);
        }
    }
    logger.summary("Semua dompet telah diproses untuk siklus ini.");
}


/**
 * Fungsi utama untuk menginisialisasi bot, mendapatkan input pengguna,
 * dan memulai jadwal eksekusi otomatis.
 */
async function main() {
    logger.banner();

    const encryptAmount = await askQuestion("Masukkan jumlah ETH untuk dienkripsi di setiap siklus (cth: 0.01): ");
    if (isNaN(parseFloat(encryptAmount)) || parseFloat(encryptAmount) <= 0) {
        logger.error("Jumlah tidak valid. Silakan masukkan angka positif.");
        rl.close();
        return;
    }

    const cycleCountStr = await askQuestion("Berapa kali siklus (Encrypt -> Decrypt -> Claim) ini ingin dijalankan untuk setiap dompet? ");
    const cycleCount = parseInt(cycleCountStr, 10);
    if (isNaN(cycleCount) || cycleCount < 1) {
        logger.error("Jumlah siklus tidak valid. Masukkan angka lebih besar dari 0.");
        rl.close();
        return;
    }

    rl.close();
    logger.section("Konfigurasi Selesai");

    // Eksekusi pertama kali
    logger.info("Memulai eksekusi pertama...");
    await runSequentialCycle(encryptAmount, cycleCount);

    // Menjadwalkan eksekusi berikutnya
    const intervalInMs = RUN_INTERVAL_HOURS * 60 * 60 * 1000;
    logger.summary(`Eksekusi pertama selesai. Bot akan menjalankan siklus penuh secara otomatis setiap ${RUN_INTERVAL_HOURS} jam.`);
    logger.countdown(intervalInMs / 1000);

    setInterval(async () => {
        logger.section(`Memulai eksekusi terjadwal setiap ${RUN_INTERVAL_HOURS} jam`);
        await runSequentialCycle(encryptAmount, cycleCount);
        logger.summary("Eksekusi terjadwal selesai. Menunggu interval berikutnya.");
        logger.countdown(intervalInMs / 1000);
    }, intervalInMs);
}

main().catch((error) => {
    logger.critical(`Terjadi kesalahan yang tidak dapat dipulihkan: ${error.message}`);
    console.error(error);
    process.exit(1);
});
