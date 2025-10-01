import { randomUUID } from "crypto";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  ScanCommand,
  GetCommand,
  UpdateCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.TABLE_NAME;

const json = (statusCode, data) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
    // CORS (testing): relax; lock down in prod
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization"
  },
  body: JSON.stringify(data),
});

// Extract /items/{id}
const getIdFromPath = (path) => {
  const m = /^\/items\/([A-Za-z0-9_.\-]+)$/.exec(path || "");
  return m ? m[1] : null;
};

export const handler = async (event) => {
  const method = event?.requestContext?.http?.method || "GET";
  const path = event?.rawPath || "/";

  // Simple health route (optional, but handy)
  if (path === "/health") {
    return json(200, { ok: true, table: TABLE, time: new Date().toISOString() });
  }

  if (method === "OPTIONS") return json(204, {});

  // ---------- CREATE: POST /items ----------
  if (method === "POST" && path === "/items") {
    // Handle possible base64
    let bodyText = event.body || "";
    if (event.isBase64Encoded) {
      bodyText = Buffer.from(bodyText, "base64").toString("utf8");
    }

    let body = {};
    try {
      body = bodyText ? JSON.parse(bodyText) : {};
    } catch {
      return json(400, { error: "BadRequest", message: "Body must be valid JSON" });
    }

    const item = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      ...body,
    };

    try {
      await ddb.send(new PutCommand({ TableName: TABLE, Item: item }));
      return json(201, { ok: true, item });
    } catch (err) {
      console.error("PutItem error:", err);
      return json(500, { error: err.name || "Error", message: err.message || String(err) });
    }
  }

  // ---------- LIST: GET /items ----------
  if (method === "GET" && path === "/items") {
    try {
      const res = await ddb.send(
        new ScanCommand({ TableName: TABLE, Limit: 20 /*, ConsistentRead: true */ })
      );
      return json(200, { ok: true, count: res.Items?.length || 0, items: res.Items || [] });
    } catch (err) {
      console.error("Scan error:", err);
      return json(500, { error: err.name || "Error", message: err.message || String(err) });
    }
  }

  // ---------- READ ONE: GET /items/{id} ----------
  if (method === "GET" && path.startsWith("/items/")) {
    const id = getIdFromPath(path);
    if (!id) return json(400, { error: "BadRequest", message: "Missing or invalid id in path" });

    try {
      const res = await ddb.send(new GetCommand({
        TableName: TABLE,
        Key: { id },
        // ConsistentRead: true, // optional
      }));
      if (!res.Item) return json(404, { error: "NotFound", message: "Item not found" });
      return json(200, { ok: true, item: res.Item });
    } catch (err) {
      console.error("GetItem error:", err);
      return json(500, { error: err.name || "Error", message: err.message || String(err) });
    }
  }

  // ---------- UPDATE: PUT /items/{id} ----------
  if (method === "PUT" && path.startsWith("/items/")) {
    const id = getIdFromPath(path);
    if (!id) return json(400, { error: "BadRequest", message: "Missing or invalid id in path" });

    // Body
    let bodyText = event.body || "";
    if (event.isBase64Encoded) {
      bodyText = Buffer.from(bodyText, "base64").toString("utf8");
    }
    let body = {};
    try {
      body = bodyText ? JSON.parse(bodyText) : {};
    } catch {
      return json(400, { error: "BadRequest", message: "Body must be valid JSON" });
    }

    // Remove protected fields if present
    delete body.id;
    delete body.createdAt;

    const keys = Object.keys(body);
    if (keys.length === 0) {
      return json(400, { error: "BadRequest", message: "No updatable fields provided" });
    }

    // Build a dynamic update expression
    const exprNames = {};
    const exprValues = {};
    const sets = [];

    keys.forEach((k, i) => {
      const nameKey = `#k${i}`;
      const valueKey = `:v${i}`;
      exprNames[nameKey] = k;
      exprValues[valueKey] = body[k];
      sets.push(`${nameKey} = ${valueKey}`);
    });

    try {
      const res = await ddb.send(new UpdateCommand({
        TableName: TABLE,
        Key: { id },
        UpdateExpression: `SET ${sets.join(", ")}`,
        ExpressionAttributeNames: exprNames,
        ExpressionAttributeValues: exprValues,
        ConditionExpression: "attribute_exists(id)", // 404 if not exists
        ReturnValues: "ALL_NEW",
      }));
      return json(200, { ok: true, item: res.Attributes });
    } catch (err) {
      if (err.name === "ConditionalCheckFailedException") {
        return json(404, { error: "NotFound", message: "Item not found" });
      }
      console.error("UpdateItem error:", err);
      return json(500, { error: err.name || "Error", message: err.message || String(err) });
    }
  }

  // ---------- DELETE: DELETE /items/{id} ----------
  if (method === "DELETE" && path.startsWith("/items/")) {
    const id = getIdFromPath(path);
    if (!id) return json(400, { error: "BadRequest", message: "Missing or invalid id in path" });

    try {
      const res = await ddb.send(new DeleteCommand({
        TableName: TABLE,
        Key: { id },
        ConditionExpression: "attribute_exists(id)", // 404 if not exists
        ReturnValues: "ALL_OLD",
      }));
      return json(200, { ok: true, deleted: res.Attributes });
    } catch (err) {
      if (err.name === "ConditionalCheckFailedException") {
        return json(404, { error: "NotFound", message: "Item not found" });
      }
      console.error("DeleteItem error:", err);
      return json(500, { error: err.name || "Error", message: err.message || String(err) });
    }
  }

  // Fallback
  return json(404, { error: "NotFound", message: `${method} ${path} not handled` });
};
