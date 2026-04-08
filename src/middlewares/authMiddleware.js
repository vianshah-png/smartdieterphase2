export const isAdmin = (req, res, next) => {
    // Check if the session exists and the isAdmin flag is true
    if (req.session && req.session.isAdmin) {
        return next();
    }
    
    // If not authenticated, redirect to the login page
    // Note: The /api/v1/admin prefix must match your index.js mounting
    res.redirect('/api/v1/admin/login');
};