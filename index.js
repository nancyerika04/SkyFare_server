import express from "express"
import dotenv from "dotenv"
import cors from "cors"
import db from "./src/services/firestore.js"
import nodemailer from "nodemailer"
import { GoogleGenerativeAI } from '@google/generative-ai';
import cron from "node-cron";
import stripe from "stripe"

dotenv.config();
let latestflightsdata = null;
let latestSummary = null;

const app = express();
app.use(express.json());
app.use(cors());

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

app.post("/flights-data", (req, res)=>{
    const {flights} = req.body;
    if(!flights){
        return res.status(400).json({
            error:"flights data is require"
        });}
        latestflightsdata = flights;
        console.log("Receive flights data");
        res.json({status:"flights data receive"});
});

app.post("/summary",async(req,res)=>{
    const{summary} = req.body;
    if (!summary){
        return res.status(400);
    }
    latestSummary = summary;
    console.log("summary", summary);
    try{
        await db.collection('summaries').add({
            summary:summary,
            createdAt:new Date()
        });
        console.log("The summary is save");
    }
    catch(err){
            console.error(err);
            return res.status(500);
    }
    res.json({status:"summary save"});
     });

app.post("/create-checkout-session", async(req,res) => {
    try{
        const {email} = req.body;
        if(!email){
            return res.status(400).json({error:"Email is require"});
        }

        const customers = await stripe.customers.list({email, limit:1});
        const customer = customers.data.length>0 ? customers.data[0]:await stripe.customers.create({email});
        const session = await stripe.checkout.sessions.create({
            mode:"subscription",
            customer:customer.id,
            line_items:[
                {
                    price:process.env.STRIPE_PRICE_ID,
                    quantity:1
                }
            ],
            success_url:"",
            cancel_url:"",
        });
        res.json({url:session.url});
    }
    catch (error){
        console.error("stripe checkout error", error);
        res.status(500).json({error:"Error creating checkout session"});

    }
});

app.post("/check-premium", async(req,res) => {
    try{
        const {email} = req.body;
        if(!email){
            return res.status(400).json({error:"Email is require"});
        }
        const customers = await stripe.customers.list({email, limit:1});
        if (customers.data.length === 0){
            return res.json({premium:false, reason:"No customer found"});
        }

        const customer = customers.data[0];

        const subscription = await stripe.subscriptions.list[{
            customer:customer.id, 
            status : "all",
        }]
        const activeSub = subscriptions.data.fine(
            (s) => s.status === "active" || s.status === "trialing"
        );
        res.json({premium:!! activeSub});
    }
    catch(error){
        console.error("premium error", error);
        res.status(500).json({error:"error checking premium"});
    }
});
    
const transporter = nodemailer.createTransport({
    service:"gmail",
    auth:{
        user:"nancywouegam@gmail.com",
        pass : "smsbaqzrwyjpgrnj"
    },
    tls: {
        rejectUnauthorized: false
    }
    });
    

cron.schedule("* * * * * ", async()=>{
    if (!latestSummary){
        return;
    }
    const mailoptions ={
        from:"nancywouegam@gmail.com",
        to:"nancywouegam@gmail.com",
        subject:"Flight Summary",
        text:summary
        };
        transporter.sendMail(mailoptions,(error, info)=>{
            if(error){
                console.error(error);
                return res.status(500);
            }
            console.log(info.response);
            res.json({status:"Email send"});
        });
});

app.get("/test",async(req, res) =>{
    await db.collection("test").doc("hello").set({message:"hi"});
    res.send("successful");
}
);

app.listen(5000,()=>console.log("server is running"));