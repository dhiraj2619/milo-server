const requireAuth=async(req,res,next)=>{
    try {
         const autorization = req.headers.authorization || '';

         if(!autorization.startsWith('Bearer ')){
            return res.status(401).json({success:false,message:'please sign in again'});
         }
         
    } catch (error) {
        
    }
}