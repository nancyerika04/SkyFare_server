import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import db from "./src/services/firestore.js";
import nodemailer from "nodemailer";
import { GoogleGenerativeAI } from "@google/generative-ai";
import cron from "node-cron";
import Stripe from "stripe";

dotenv.config();

let latestFlightsData = null;
let latestSummary = null;

const app = express();
app.use(express.json());
app.use(cors());

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// ======================
// ROUTES
// ======================

// Receive flight data
app.post("/flights-data", (req, res) => {
  const { flights } = req.body;
  if (!flights) {
    return res.status(400).json({ error: "Flights data is required" });
  }

  latestFlightsData = flights;
  console.log("Received flights data");
  res.json({ status: "Flights data received" });
});

// Receive summary and store in Firestore
app.post("/summary", async (req, res) => {
  const { summary } = req.body;
  if (!summary) {
    return res.status(400).json({ error: "Summary is required" });
  }

  latestSummary = summary;
  console.log("Summary received:", summary);

  try {
    await db.collection("summaries").add({
      summary,
      createdAt: new Date(),
    });
    console.log("Summary saved");
    res.json({ status: "Summary saved" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error saving summary" });
  }
});

// Create Stripe checkout session
app.post("/create-checkout-session", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    const customers = await stripe.customers.list({ email, limit: 1 });
    const customer =
      customers.data.length > 0
        ? customers.data[0]
        : await stripe.customers.create({ email });

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customer.id,
      line_items: [
        {
          price: process.env.STRIPE_PRICE_ID,
          quantity: 1,
        },
      ],
      success_url: process.env.SUCCESS_URL || "http://localhost:5173/dashboard",
      cancel_url: process.env.CANCEL_URL || "http://localhost:5173/cancel",
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error("Stripe checkout error:", error);
    res.status(500).json({ error: "Error creating checkout session" });
  }
});

// Check premium status
app.post("/check-premium", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    const customers = await stripe.customers.list({ email, limit: 1 });
    if (customers.data.length === 0) {
      return res.json({ premium: false, reason: "No customer found" });
    }

    const customer = customers.data[0];

 
    const subscriptions = await stripe.subscriptions.list({
      customer: customer.id,
      status: "all",
    });

  
    const activeSub = subscriptions.data.find(
      (s) => s.status === "active" || s.status === "trialing"
    );

    res.json({ premium: !!activeSub });
  } catch (error) {
    console.error("Premium check error:", error);
    res.status(500).json({ error: "Error checking premium status" });
  }
});

app.post("/billing-info", async(req, res)=>{
    try{
        const {email}=req.body;
        if(!email){
            return res.status(400).json({error:"email is require"});

        }
        const customers=await stripe.customers.list({
            email , limit : 1

        });
        if(customers.data.length === 0){
            return res.json({active:false, message:"No customer form"});
        }

        const customer = customers.data[0];

        const subscriptions = await stripe.subscriptions.list({
            customer:customer.id, 
            status : "all",
            expand : ["data.default_payment_method"],

        });
        if (subscriptions.data.length === 0){
            return res.json({active:false, message:"No subscription found"})

        }
        const sub = subscriptions.data[0]; 
        const planName = sub.items.data[0].price.nickname || "premium plan";
        const nextBillingDate = new Date(sub.current_period_end*1000);

        res.json({
            active : sub.status === "active", 
            plan : planName ,
            nextBillingDate, 
            cancelAtPeriodEnd : sub.cancel_at_period_end, 
            status : sub.status,   
        });
    }
    catch(error){
        console.error("Billing error", error);
        res.status(500).json({error:"error fetching billing "});
    }
});

app.post("/cancel-subscription", async(req, res)=>{
     try{
        const {email}=req.body;
        if(!email){
            return res.status(400).json({error:"email is require"});

        }
        const customers=await stripe.customers.list({
            email , limit : 1

        });
        if(customers.data.length === 0){
            return res.json({active:false, message:"No customer form"});
        }

        const customer = customers.data[0];

        const subscriptions = await stripe.subscriptions.list({
            customer:customer.id, 
            status : "active",

        });
        if (subscriptions.data.length === 0){
           return res.status(404).json({error:"No active subscription"});

        }
        const sub = subscriptions.data[0];
        const canceled = await stripe.subscriptions.update(sub.id, {
            cancel_at_period_end : true , 
        });
        res.json({
            sucess : true,
            message : "Subscription will cancel at period end ",
            cancelAt: new Date(canceled.cancel_at*1000),
        })
    }
    catch(error){
        console.error("Canceled subscription error", error);
        res.status (500).json({error:"Error canceling subscription"});
    }
});

// ======================
// EMAIL SCHEDULER
// ======================
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "nancywouegam@gmail.com",
    pass: "smsbaqzrwyjpgrnj", // Move this to .env for security
  },
  tls: {
    rejectUnauthorized: false,
  },
});

cron.schedule("* * * * *", async () => {
  if (!latestSummary) return;

  const mailOptions = {
    from: "nancywouegam@gmail.com",
    to: "nancywouegam@gmail.com",
    subject: "Flight Summary",
    text: latestSummary, // Fixed: use latestSummary instead of undefined 'summary'
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log("Email sent:", info.response);
  } catch (error) {
    console.error("Error sending email:", error);
  }
});

// ======================
// TEST ROUTE
// ======================
app.get("/test", async (req, res) => {
  await db.collection("test").doc("hello").set({ message: "hi" });
  res.send("Successful");
});

// ======================
// SERVER START
// ======================
app.listen(5000, () => console.log("Server is running on port 5000"));


