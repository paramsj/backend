import { v2 as cloudinary } from "cloudinary";
import fs from "fs";


cloudinary.config({ 
    cloud_name: "put it here", 
    api_key: "put it here", 
    api_secret: "put it here"
});

const uploadOnCloudinary = async (localFilePath) => {
    try {
        if(!localFilePath) {
            throw new Error("No file path provided for upload");
        }
        const response = await cloudinary.uploader.upload(localFilePath, {
            resource_type: "auto"
        });

        console.log("File uploaded successfully");

        fs.unlinkSync(localFilePath);
        return response;
    } catch (error) {
        if (localFilePath && fs.existsSync(localFilePath)) {
            fs.unlinkSync(localFilePath);
        }
        console.error("Error uploading to Cloudinary:", error);
        throw error;
    }
}

export { uploadOnCloudinary }