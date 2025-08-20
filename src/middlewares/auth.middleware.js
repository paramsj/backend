import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import jwt from "jsonwebtoken";
import {User} from "../models/user.model.js";

export const verifyJWT = asyncHandler(async(req,res,next)=>{

    try {
        const token = req.cookies?.accessToken || req.headers("Authorization")?.replace("Bearer ","");
        if(!token) {
            throw new ApiError(401,"Access token is required");
        }
        const decodedToken = jwt.verify(token,process.env.ACCESS_TOKEN_SECRET);
        const user = await User.findById(decodedToken?._id);

        if(!user) {
            throw new ApiError(404,"User not found");
        }
        req.user = user;
        next();
    } catch (error) {
        if(error.name === "TokenExpiredError") {
            return res.status(401).json(new ApiError(401,"Access token expired"));
        }
        if(error.name === "JsonWebTokenError") {
            return res.status(401).json(new ApiError(401,"Invalid access token"));
        }
        return res.status(500).json(new ApiError(500,"Internal server error"));
    }
});