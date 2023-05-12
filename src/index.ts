import express from "express";
import cors from 'cors';
import http from "http";
import path from "path";
import { Server } from "socket.io";
import SocketManager from "./sockets/socket";
import logger from "./logger/logger";

const app = express();

app.use(cors());
app.use(express.urlencoded());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

class FileSharerServer extends SocketManager {

  httpServer: http.Server;

  private readonly PORT = process.env.PORT || 3005;

  constructor() {
    super();
    this.httpServer = http.createServer(app);
    this.initialize(new Server(this.httpServer, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      }
    }));
    this.registerRoutes();
  }

  registerRoutes() {
    app.get("/", (req: any, res: any) => {
      res.sendFile(path.join(__dirname, "./index.html"));
    });

    app.post("/isValidRoom", (req: any, res: any) => {
      const { roomId } = req.body;
      const roomInfo = this.getRoomInfo(roomId);
      res.json({ status: !roomInfo.invalid, fileInfo: roomInfo?.fileInfo ?? {} });
    });
  }

  run() {
    this.httpServer.listen(this.PORT, () => {
      logger.info(`Server is running at PORT:`, this.PORT);
    });
  }
}

new FileSharerServer().run();
