import { useState, useRef, useCallback } from "react";

const STAGES = ["idle", "capture", "analyzing", "searching", "results"];

const mockProduct = {
  name: "Sony WH-1000XM5",
  brand: "Sony",
  category: "Wireless Headphones",
  confidence: 97,
};

const mockResults = [
  { store: "Amazon", price: 279.99, shipping: "Free", delivery: "Tomorrow", url: "#", badge: "Best Deal", color: "#FF9500" },
  { store: "Best Buy", price: 299.99, shipping: "Free", delivery: "2 days", url: "#", badge: null, color: "#0046BE" },
  { store: "Walmart", price: 312.00, shipping: "Free", delivery: "3 days", url: "#", badge: null, color: "#0071CE" },
  { store: "B&H Photo", price: 329.95, shipping: "$4.99", delivery: "4 days", url: "#", badge: null, color: "#BD2031" },
  { store: "eBay", price: 219.00, shipping: "$12.99", delivery: "5-7 days", url: "#", badge: "Used", color: "#E53238" },
];

