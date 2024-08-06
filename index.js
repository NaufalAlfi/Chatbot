const {
  makeWASocket,
  useMultiFileAuthState,
} = require("@whiskeysockets/baileys");
const pino = require("pino");

async function connectWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState("session");
  const socket = makeWASocket({
    printQRInTerminal: true,
    browser: ["WA Bot", "", ""],
    auth: state,
    logger: pino({ level: "silent" }),
  });

  socket.ev.on("creds.update", saveCreds);
  socket.ev.on("connection.update", async ({ connection, lastDisconnect }) => {
    if (connection === "open") {
      console.log("Terhubung");
    } else if (connection === "close" && lastDisconnect.error) {
      console.log(
        "Koneksi terputus karena error, mencoba menghubungkan ulang..."
      );
      setTimeout(connectWhatsApp, 5000);
    }
  });

  let consultationStatus = {};
  let messageCount = {};
  const MESSAGE_LIMIT = 5;
  const TIME_WINDOW = 60000; // 60 seconds

  const getGreetingTime = () => {
    const now = new Date();
    const hour = now.getHours();
    if (hour < 11) return "Pagi";
    if (hour < 15) return "Siang";
    if (hour < 18) return "Sore";
    return "Malam";
  };

  socket.ev.on("messages.upsert", async ({ messages }) => {
    const message = messages[0];

    if (message.key.fromMe) return;
    const isGroup = message.key.remoteJid.includes("@g.us");
    if (isGroup) return;

    // Memeriksa apakah `message.message` terdefinisi
    if (!message.message) return;

    const incomingMessage =
      message.message.conversation ||
      message.message.extendedTextMessage?.text ||
      "";

    const pengirim = message.key.remoteJid;

    if (!incomingMessage) return;

    if (!messageCount[pengirim]) {
      messageCount[pengirim] = [];
    }
    messageCount[pengirim].push(Date.now());

    messageCount[pengirim] = messageCount[pengirim].filter(
      (timestamp) => Date.now() - timestamp < TIME_WINDOW
    );

    if (messageCount[pengirim].length > MESSAGE_LIMIT) {
      console.log(`Spam detected from ${pengirim}`);
      await socket.sendMessage(pengirim, {
        text: "Anda terlalu sering mengirim pesan. Mohon tunggu sebentar.",
      });
      return;
    }

    if (
      !consultationStatus[pengirim] &&
      (incomingMessage.toLowerCase() === "hallo" ||
        incomingMessage.toLowerCase() === "halo")
    ) {
      consultationStatus[pengirim] = "waitingForChoice";
      const greetingTime = getGreetingTime();
      const welcomeMessage = `Selamat ${greetingTime}, Selamat datang di konsultasi Herbalife`;

      setTimeout(async () => {
        await socket.sendMessage(pengirim, { text: welcomeMessage });
        const optionsMessage =
          "Silahkan pilih opsi konsultasi Anda:\n1. Konsultasi Kesehatan\n2. Konsultasi Produk";

        setTimeout(async () => {
          await socket.sendMessage(pengirim, { text: optionsMessage });
        }, 3000);
      }, 3000);
    } else if (consultationStatus[pengirim] === "waitingForChoice") {
      switch (incomingMessage.trim()) {
        case "1":
        case "Konsultasi Kesehatan":
          await socket.sendMessage(pengirim, {
            text: "Anda berada di konsultasi Kesehatan, silahkan ajukan konsultasi Anda dan tunggu Admin menjawabnya",
          });
          delete consultationStatus[pengirim];
          break;
        case "2":
        case "Konsultasi Produk":
          consultationStatus[pengirim] = "waitingForSubChoice";
          await socket.sendMessage(pengirim, {
            text: "Silahkan pilih opsi:\n1. Tanya Admin\n2. Lihat Produk Kami",
          });
          break;
        default:
          await socket.sendMessage(pengirim, {
            text: "Silahkan pilih nomor 1 atau 2",
          });
          break;
      }
    } else if (consultationStatus[pengirim] === "waitingForSubChoice") {
      switch (incomingMessage.trim()) {
        case "1":
        case "Tanya Admin":
          await socket.sendMessage(pengirim, {
            text: "Silahkan ajukan konsultasi Anda terkait produk kami dan tunggu Admin menjawabnya.",
          });
          delete consultationStatus[pengirim];
          break;
        case "2":
        case "Lihat Produk":
          await socket.sendMessage(pengirim, {
            text: "Untuk melihat produk lebih lengkap silahkan klik link di bawah ini:\n\nhttps://www.herbalife.com/id-id/u/category/all-products",
          });
          delete consultationStatus[pengirim];
          break;
        default:
          await socket.sendMessage(pengirim, {
            text: "Silahkan pilih nomor 1 atau 2",
          });
          break;
      }
    }
  });
}

connectWhatsApp();
