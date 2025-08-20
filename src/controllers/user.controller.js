import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { User } from '../models/user.model.js';
import { uploadOnCloudinary } from '../utils/cloudinary.js';
import bcrypt from 'bcrypt';
import jwt from "jsonwebtoken";

const registerUser = asyncHandler(async (req, res) => {
    const { username, fullname, email, password } = req.body;
    if ([fullname, email, username, password].some((field) => field?.trim() === "")) {
        throw new ApiError(400, "FILL THEM ALL is required");
    }
    const existedUser = await User.findOne({
        $or: [
            { username: username.toLowerCase() },
            { email: email.toLowerCase() }
        ]
    })
    if (existedUser) {
        throw new ApiError(409, "Username or Email already exists");
    }
    const avatarLocalPath = req.files?.avatar[0]?.path;
    const coverImageLocalPath = req.files?.coverImage[0]?.path;
    if (!avatarLocalPath) {
        throw new ApiError(400, "Avatar is required");
    }
    if (!coverImageLocalPath) {
        throw new ApiError(400, "Cover image is required");
    }
    console.log("Avatar Local Path:", avatarLocalPath);
    console.log("Cover Image Local Path:", coverImageLocalPath);

    const avatar = await uploadOnCloudinary(avatarLocalPath);
    const coverImage = await uploadOnCloudinary(coverImageLocalPath);

    if (!avatar || !coverImage) {
        throw new ApiError(500, "Failed to upload images");
    }
    const user = await User.create({
        fullname,
        avatar: avatar.url,
        coverImage: coverImage.url,
        email,
        password,
        username: username
    });
    const createdUser = await User.findById(user._id);
    if (!createdUser) {
        throw new ApiError(500, "Failed to create user");
    }
    return res.status(201).json(
        new ApiResponse(200, {
            data: createdUser,
            message: "User created successfully"
        })
    )
})

const loginUser = asyncHandler(async (req, res) => {
    console.log("Headers:", req.headers);
    console.log("Body:", req.body);
    console.log(req.body);
    const { email, username, password } = req.body;
    // if (!username || !email) {
    //     throw new ApiError(400, "Username and Email are required");
    // }

    const user = await User.findOne({
        $or: [{ username, email }]
    })
    if (!user) {
        throw new ApiError(404, "User not found");
    }

    const isPasswordCorrect = await user.isPasswordCorrect(password);
    if (!isPasswordCorrect) {
        throw new ApiError(401, "The password is incorrect");
    }
    const userById = await User.findById(user._id);
    if (!userById) {
        throw new ApiError(404, "User not found");
    }
    const accessToken = await userById.generateAccessToken();
    const refreshToken = await userById.generateRefreshToken();
    userById.refreshToken = refreshToken;
    await userById.save();
    const options = {
        httpOnly: true,
        secure: true,
    }
    return res.status(200).cookie('accessToken', accessToken, options)
        .cookie('refreshToken', refreshToken, options)
        .json(
            new ApiResponse(200, {
                user: userById,
                accessToken,
                refreshToken,
            },
                "Login successful"
            )
        )
})

const logoutUser = asyncHandler(async (req, res) => {
    await User.findByIdAndUpdate(req.user._id,
        {
            $set: {
                refreshToken: undefined
            }
        },
        {
            new: true,
        }
    )
    const options = {
        httpOnly: true,
        secure: true,
    }
    return res.status(200)
        .clearCookie('accessToken', options)
        .clearCookie('refreshToken', options)
        .json(
            new ApiResponse(200, {
                message: "Logout successful"
            })
        )
});

const refreshAccessToken = asyncHandler(async (req, res) => {
    try {
        const incomingRefreshToken = req.cookies?.refreshToken || req.body.refreshToken;
        if (!incomingRefreshToken) {
            throw new ApiError(401, "Refresh token is required");
        }
        const decodedToken = jwt.verify(
            incomingRefreshToken,
            process.env.REFRESH_TOKEN_SECRET,
        )
        const user = await User.findById(decodedToken?._id);
        if (!user) {
            throw new ApiError(404, "Invalid refresh token");
        }
        if (incomingRefreshToken !== user.refreshToken) {
            throw new ApiError(401, "Invalid refresh token");
        }

        const options = {
            httpOnly: true,
            secure: true,
        }
        const accessToken = await user.generateAccessToken();
        const refreshToken = await user.generateRefreshToken();
        user.refreshToken = refreshToken;
        await user.save();
        return res.status(200).cookie('accessToken', accessToken, options)
            .cookie('refreshToken', refreshToken, options)
            .json(
                new ApiResponse(200, {
                    user: user,
                    accessToken,
                    refreshToken,
                },
                    "Access token refreshed"
                )
            )
    } catch (error) {
        throw new ApiError(500, "Invalid Refresh Token");
    }
});

const changeCurrentPassword = asyncHandler(async(req,res) =>{
    const {oldPassword,newPassword} = req.body;
    const user = await User.findById(req.user?.id);
    const isPasswordCorrect = await user.isPasswordCorrect(oldPassword);
    if(!isPasswordCorrect) {
        throw new ApiError(400,"The old password is incorrect");
    }
    user.password = newPassword;
    await user.save({validateBeforeSave : true});
    return res.status(200).json(
        new ApiResponse(200,{},"password was changed")
    )
});

const getCurrentUser = asyncHandler(async(req,res)=>{
    return res.status(200).json(
        200,req.user,"current user has been given"
    )
});

const updateAccountDetails = asyncHandler(async(req,res)=>{
    const {fullname,email}  = req.body;
    if(!fullname || !email) {
        throw new ApiError(400,"Fullname and Email are required");
    }

    const user = await User.findByIdAndUpdate(req.user._id,
        {
            $set : {
                fullname : fullname,
                email : email,
            }
        },
        {
            new : true
        }
    )
    return res.status(200).json(
        200,user,"Account details updated successfully"
    );
});

const updateUserAvatar = asyncHandler(async(req,res)=>{
    const avatarLocalPath = req.file?.path;
    if(!avatarLocalPath) {
        throw new ApiError(400,"Avatar is required");
    }
    const avatar = await uploadOnCloudinary(avatarLocalPath);
    if(!avatar) {
        throw new ApiError(500,"Failed to upload avatar/cloudinary");
    }
    const user = await User.findByIdAndUpdate(req.user._id,
        {
            $set : {
                avatar : avatar.url
            },
        },
        {
            new : true
        }, 
    ).select("-password");

    return res.status(200).json(
        200,user,"Avatar updated successfully"
    )
});

const updateUserCover = asyncHandler(async(req,res)=>{
    const coverLocalPath = req.file?.path;
    if(!coverLocalPath) {
        throw new ApiError(400,"Cover image is required");
    }
    const cover = await uploadOnCloudinary(cover);
    if(!avatar) {
        throw new ApiError(500,"Failed to upload avatar/cloudinary");
    }
    const user = await User.findByIdAndUpdate(req.user._id,
        {
            $set : {
                coverImage : cover.url
            },
        },
        {
            new : true
        }, 
    ).select("-password");

    return res.status(200).json(
        200,user,"CoverImage updated successfully"
    )
});

const getUserChannelProfile = asyncHandler(async (req, res) => {
    const {username} = req.params;
    if(!username) {
        throw new ApiError(400,"Username is required");
    }
    const channel = User.aggregate([{
        $match : {
            username : username.toLowerCase(),
        }
    },{
        $lookup : {
            from : "subscriptions",
            localField : "_id",
            foreignField : "channel",
            as : "subscribers",
        }
    },{
        $lookup : {
            from : "subscriptions",
            localField : "_id",
            foreignField : "subscriber",
            as : "subscribedTo",
        }
    }, {
        $addFields : {
            subscriberCount : {
                $size : "$subsribers"
            },
            channelsSubscribedTo : {
                $size :  "$subscribedTo"
            },
            isSubsribed : {
                $cond : {
                    if : {
                        $in : [req.user?._id, "$subscribers.subscriber"]
                    },
                    then : true,
                    else : false
                }
            }
        }
    },{
       $project : {
        fullname : 1,
        username : 1,
        subscriberCount : 1,
        channelsSubscribedTo : 1, 
        subscribedTo: 1,
        isSubsribed : 1,
        avatar : 1,
        coverImage : 1,
        email : 1,
       } 
    }]);

    if(!channel) {
        throw new ApiError(404,"Channel not found");
    };
    return res.status(200).json(
        new ApiResponse(200,channel,"Channel profile retrieved successfully")
    )
});

const getWatchHistory = asyncHandler(async (req, res) => {
  const user = await User.aggregate([
    {
      $match: {
        _id: new mongoose.Types.ObjectId(req.user._id)
      }
    },
    {
      $lookup: {
        from: "videos",
        localField: "watchHistory",
        foreignField: "_id",
        as: "watchHistoryVideos",
        pipeline: [
          {
            $lookup: {
              from: "users",
              localField: "owner",
              foreignField: "_id",
              as: "owner",
              pipeline: [
                {
                  $project: {
                    fullname: 1,
                    username: 1,
                    avatar: 1
                  }
                }
              ]
            }
          },
          {
            $addFields: {
              owner: { $first: "$owner" }
            }
          }
        ]
      }
    }
  ]);

  res.status(200).json(user[0]);
});

export { registerUser, loginUser, logoutUser, refreshAccessToken , changeCurrentPassword , 
    getCurrentUser , updateAccountDetails, updateUserAvatar ,updateUserCover , getUserChannelProfile, getWatchHistory};