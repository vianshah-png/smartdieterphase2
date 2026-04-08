import { insertRecord } from "../config/query.js";
import { tables } from "../helper/constant.js";

let adminMap = new Map();
// if(adminMap.has(req))

export const sseHandler = (req, res) => {
  if (req.method !== "GET") {
    res.status(405).send("Method Not Allowed");
    return;
  }

  const mentor_id = Number(req.query.mentor_id);

  if (isNaN(mentor_id) || mentor_id <= 0) {
    res.status(400).send("Valid mentor_id is required for SSE connection");
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-store");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  if (!adminMap.has(mentor_id)) {
    adminMap.set(mentor_id, []);
  }

  adminMap.get(mentor_id).push(res);

  console.log(`New SSE connection established for user: ${mentor_id}`);

  res.write(
    `data: ${JSON.stringify({ message: "Connection established" })}\n\n`
  );

  req.on("close", () => {
    const connections = adminMap.get(mentor_id);
    if (connections) {
      const index = connections.indexOf(res);
      if (index !== -1) {
        connections.splice(index, 1);
      }
    }
    if (connections.length === 0) {
      adminMap.delete(mentor_id);
    }
    res.end();
  });
};

function sendSSEEvent({ mentor_id, data }) {
  const connections = adminMap.get(Number(mentor_id));
  
  if (connections && connections.length > 0) {
    try {
      connections.forEach((client) => {
        console.log(`Notification sent to user ${mentor_id}:`, data);
        client.write(`data: ${JSON.stringify(data)}\n\n`);
      });
    } catch (error) {
      console.error(`Failed to send notification to user ${mentor_id}:`, error);
      adminMap.delete(mentor_id);
    }
  } else {
    console.log(`No active SSE connections found for user ${mentor_id}`);
  }
}

// --- Updated triggerEvent ---
async function triggerEvent(req, res) {
  const { id, priority = 1, data, user_id, redirect } = req.query;

  // 1. Send the SSE event IMMEDIATELY
  // This happens in milliseconds, bypasses the DB wait time.
  sendSSEEvent({
    mentor_id: id,
    data: {
      title: `${data}`,
      redirect: redirect,
      priority: Number(priority),
    },
  });

  // 2. Return success to the caller right away
  res.status(200).json({ success: true });

  // 3. Handle DB insertion in the background (Remove the 'await')
  // By not using 'await' here, the server processes this while the user
  // has already received the notification.
  insertRecord(
    tables.mentorNotifications,
    ["user_id", "admin_id", "content", "redirect"],
    [user_id, id, data, redirect]
  ).catch(err => {
    console.error("Background DB Insert Failed:", err);
  });
}
export { sendSSEEvent, triggerEvent };
