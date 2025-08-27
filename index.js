import express from "express"
import dotenv from "dotenv"
import cors from "cors"
import db from "./src/services/firestore.js"
import nodemailer from "nodemailer"
import { GoogleGenerativeAI } from '@google/generative-ai';
import cron from "node-cron";

dotenv.config();
let latestflightsdata = null;

const app = express();
app.use(express.json());
app.use(cors());

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