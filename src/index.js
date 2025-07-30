import express from "express"
import dotenv from "dotenv"
import cors from "cors"
import db from "./services/firestore.js"

const app = express();

app.get("/test",async(req, res) =>{
    await db.collection("test").doc("hello").set({message:"hi"});
    res.send("successful");
}
);

app.listen(5000,()=>console.log("server is running"));