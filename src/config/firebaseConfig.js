import { config } from "dotenv";
import serviceAccount from "../../fcmCredential.json" with { type: "json" };

// Load environment variables from .env file
config();

// Dynamically import firebase-admin as it's a CommonJS module
const admin = await import("firebase-admin");

// Initialize Firebase app with service account credentials
admin.default.initializeApp({
  credential: admin.default.credential.cert(serviceAccount),
});

class FCM {
  constructor() {
    this.messaging = admin.default.messaging(); // Firebase messaging instance
  }

  // Method for sending a message to a single device using v1 API
  async sendToDevice(registrationToken, payload) {
    try {
      const message = {
        token: registrationToken, // For v1 API, this should be `token` not `registrationToken`
        notification: payload.notification, // Ensure this matches the v1 API structure
        data: payload.data, // Optional: Custom data payload
      };

      const response = await this.messaging.send(message);
      console.log("Successfully sent message:", response);
      return response;
    } catch (error) {
      console.error("Error sending message:", error);
      throw error;
    }
  }

  // Method for subscribing to a topic
  async subscribeToTopic(registrationTokens, topic) {
    try {
      const response = await this.messaging.subscribeToTopic(
        registrationTokens,
        topic
      );
      console.log("Successfully subscribed to topic:", response);
      return response;
    } catch (error) {
      console.error("Error subscribing to topic:", error);
      throw error;
    }
  }

  // Method for unsubscribing from a topic
  async unsubscribeFromTopic(registrationTokens, topic) {
    try {
      const response = await this.messaging.unsubscribeFromTopic(
        registrationTokens,
        topic
      );
      console.log("Successfully unsubscribed from topic:", response);
      return response;
    } catch (error) {
      console.error("Error unsubscribing from topic:", error);
      throw error;
    }
  }
}

export { FCM };
