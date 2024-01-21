const express = require('express');
const expressWs = require('express-ws');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
expressWs(app, server);

const clients = [];

function sendConsoleMessage(message) {
  clients.forEach(({ ws }) => {
    ws.send(JSON.stringify({ type: 'console_message', text: message }));  
  });
}

function sendOnlineClients() {
  const onlineClients = clients.map((client) => {
    return {
      id: client.userData.id,
      name: client.userData.name,
      userAgent: client.userData.userAgent,
    };
  });

  const message = JSON.stringify({ type: 'online_clients', clients: onlineClients });

  // Broadcast the list to all connected admins
  clients.forEach(({ ws }) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  });
}

app.ws('/', (ws, req) => {
  const ip = req.connection.remoteAddress;
  const userAgent = req.headers['user-agent'];

  // Extract name from the URL query parameters
  const { name } = req.query;

  const userData = {
    id: generateUserId(),
    name: name || 'Новый пользователь',
    ip,
    userAgent,
  };

  
  clients.push({ ws, userData });

  const connectionMessage = `Новый клиент подключен. ID: ${userData.id}, Имя: ${userData.name}, IP: ${ip}, User-Agent: ${userAgent}, Время: ${getCurrentDateTime()}`;
  console.log(connectionMessage);
  sendConsoleMessage(connectionMessage);

  // Send the list of online clients to the new client
  sendOnlineClients();

  ws.on('message', (message) => {
    console.log(`Получено сообщение от клиента ID ${userData.id}: ${message}`);
    if (message === 'ping') {
      // Respond to 'ping' with 'pong'
      ws.send('pong');
      console.log(`Отправлен ответ 'pong' клиенту ID ${userData.id}`);
      return;
    }    

    if (isMessageFromAdmin(message)) {
      const adminCommand = parseAdminCommand(message);

      if (adminCommand.targetUserId !== undefined && adminCommand.message !== undefined) {
        sendAdminMessage(adminCommand.targetUserId, adminCommand.message, userData.id);
      } else {
        console.log('Неверный формат команды админа.');
      }
    } else {
      sendNotificationToAll(`${message}`, userData.id);
      // Send server console messages to the admin
      sendConsoleMessage(`Получено сообщение от клиента ID ${userData.id}: ${message}`);
    }
  });

  ws.on('close', () => {
    console.log(`Клиент отключен. ID: ${userData.id}, Имя: ${userData.name}, Время: ${getCurrentDateTime()}`);
    sendConsoleMessage(`Клиент отключен. ID: ${userData.id}, Имя: ${userData.name}, Время: ${getCurrentDateTime()}`);
    removeClient(ws, userData.id, false);

    // Send the updated list of online clients to admin when a client disconnects
    sendOnlineClients();
  });
});

function sendNotificationToAll(text, clientId) {
  const notificationMessage = {
    type: 'notification',
    text,
    clientId,
  };

  clients.forEach(({ ws }) => {
    ws.send(JSON.stringify(notificationMessage));
  });
}

function sendAdminMessage(targetUserId, message, adminSenderId) {
  if (targetUserId === '' || targetUserId === null) {
    // Send the message to all users
    clients.forEach(({ ws }) => {
      const adminMessage = {
        type: 'admin_message',
        text: message,
        adminSenderId,
      };
      ws.send(JSON.stringify(adminMessage));
    });
    console.log(`Администратор отправил сообщение всем пользователям: ${message}`);
  } else {
    const targetClient = clients.find((client) => client.userData.id === targetUserId);

    if (targetClient) {
      const adminMessage = {
        type: 'admin_message',
        text: message,
        adminSenderId,
      };

      targetClient.ws.send(JSON.stringify(adminMessage));
      console.log(`Администратор отправил сообщение пользователю ID ${targetUserId}: ${message}`);
    } else {
      console.log(`Пользователь с ID ${targetUserId} не найден.`);
    }
  }
}

function removeClient(ws, clientId, isExpected = true) {
  const index = clients.findIndex((client) => client.ws === ws && client.userData.id === clientId);
  if (index !== -1) {
    const disconnectedClient = clients.splice(index, 1)[0];
    const { userData } = disconnectedClient;
    console.log(`Клиент отключен. ID: ${userData.id}, Имя: ${userData.name}, Время: ${getCurrentDateTime()}`);

    if (isExpected) {
      sendNotificationToAll(`Клиент отключен. ID: ${userData.id}`, userData.id);
    }
  }
}

const PORT = 3000;
server.listen(PORT, () => {
  const serverMessage = `Сервер запущен на http://localhost:${PORT}, Время: ${getCurrentDateTime()}`;
  console.log(serverMessage);
  sendConsoleMessage(serverMessage);
});

function generateUserId() {
  return Math.random().toString(36).substring(2, 15);
}

function isMessageFromAdmin(message) {
  const parsedCommand = parseAdminCommand(message).command;
  return typeof parsedCommand === 'string' && parsedCommand.toLowerCase() === '/admin_message';
}

function parseAdminCommand(message) {
  const [command, targetUserId, ...messageParts] = message.split(':');
  const parsedCommand = command.trim().toLowerCase();
  const parsedTargetUserId = targetUserId !== '' ? targetUserId.trim() : null;
  const parsedMessage = messageParts.join(':').trim();
  
  return {
    command: parsedCommand,
    targetUserId: parsedTargetUserId,
    message: parsedMessage,
  };
}

function getCurrentDateTime() {
  const currentDateTime = new Date().toLocaleString();
  return currentDateTime;
}
