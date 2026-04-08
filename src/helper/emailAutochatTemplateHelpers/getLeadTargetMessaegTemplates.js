// export function generateSuccessStoryContent({ clientName, story }) {
//     if (!story) {
//         return `
//             <p>Hi ${clientName || 'there'},</p>
//             <p>No success stories found for this condition at the moment.</p>
//         `;
//     }

//     return `
//         <p style="font-size: 18px; color: #555;">Hey there, <strong>${clientName || 'there'}</strong>! 👋</p>
        
//         <p style="font-size: 16px;">We wanted to share an inspiring success story with you today. Real people, real results!</p>
        
//         <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 25px 0;">
        
//         <p style="font-size: 16px; font-style: italic; color: #555; padding: 15px; background-color: #f9f9f9; border-left: 4px solid #03989F;">
//             ${story.short_descriptions || ""}
//         </p>
        
//         <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 25px 0;">
        
//         <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top: 30px;">
//             <tr>
//                 <td align="center">
//                     <a href="${story.web_link}" style="display: inline-block; padding: 14px 28px; margin: 5px; background-color: #03989F; color: #ffffff; text-decoration: none; border-radius: 5px; font-weight: bold;">Read Full Story</a>
//                     <a href="${story.app_link}" style="display: inline-block; padding: 14px 28px; margin: 5px; background-color: #FFB513; color: #ffffff; text-decoration: none; border-radius: 5px; font-weight: bold;">Open in App</a>
//                 </td>
//             </tr>
//         </table>
//     `;
// }

// // Blog Email Content
// export function generateBlogContent({ clientName, blog }) {
//     if (!blog) {
//         return `
//             <p>Hi ${clientName || 'there'},</p>
//             <p>No blogs found for this condition at the moment.</p>
//         `;
//     }

//     return `
//         <p style="font-size: 18px; color: #555;">Hi there, <strong>${clientName || 'there'}</strong>! 📖</p>
        
//         <p style="font-size: 16px;">Here's today's featured health article that we think you'll find valuable:</p>
        
//         <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 25px 0;">
        
//         <h2 style="color: #2c3e50; font-size: 24px; margin-top: 0;">${blog.postTitle}</h2>
        
//         <p style="font-size: 16px; color: #555;">
//             ${blog.postDesc || ""}
//         </p>
        
//         <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 25px 0;">
        
//         <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top: 30px;">
//             <tr>
//                 <td align="center">
//                     <a href="${blog.web_link}" style="display: inline-block; padding: 14px 28px; margin: 5px; background-color: #03989F; color: #ffffff; text-decoration: none; border-radius: 5px; font-weight: bold;">Read Full Article</a>
//                     <a href="${blog.app_link}" style="display: inline-block; padding: 14px 28px; margin: 5px; background-color: #FFB513; color: #ffffff; text-decoration: none; border-radius: 5px; font-weight: bold;">Open in App</a>
//                 </td>
//             </tr>
//         </table>
//     `;
// }

// // Social Post Email Content
// export function generateSocialPostContent({ clientName, post }) {
//     if (!post) {
//         return `
//             <p>Hi ${clientName || 'there'},</p>
//             <p>No social posts found for this condition at the moment.</p>
//         `;
//     }

//     return `
//         <p style="font-size: 18px; color: #555;">Hey, <strong>${clientName || 'there'}</strong>! ✨</p>
        
//         <p style="font-size: 16px;">Check out this post we shared today on our social media. Here's a quick tip for you:</p>
        
//         <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 25px 0;">
        
//         ${post.title ? `<h2 style="color: #2c3e50; font-size: 24px; margin-top: 0;">${post.title}</h2>` : ''}
        
//         ${post.description ? `<p style="font-size: 16px; color: #555;">${post.description}</p>` : ''}
        
//         ${post.image_link ? `
//         <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 20px 0;">
//             <tr>
//                 <td align="center">
//                     <img src="${post.image_link}" alt="Post Image" style="max-width: 100%; height: auto; border-radius: 8px; display: block;" />
//                 </td>
//             </tr>
//         </table>
//         ` : ''}
        
//         <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 25px 0;">
        
//         <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top: 30px;">
//             <tr>
//                 <td align="center">
//                     ${post.balance_nutrition_link ? `<a href="${post.balance_nutrition_link}" style="display: inline-block; padding: 14px 28px; margin: 5px; background-color: #03989F; color: #ffffff; text-decoration: none; border-radius: 5px; font-weight: bold;">View on Balance Nutrition</a>` : ''}
//                     ${post.khyati_rupani_link ? `<a href="${post.khyati_rupani_link}" style="display: inline-block; padding: 14px 28px; margin: 5px; background-color: #FFB513; color: #ffffff; text-decoration: none; border-radius: 5px; font-weight: bold;">View on Khyati Rupani</a>` : ''}
//                 </td>
//             </tr>
//         </table>
//     `;
// }

// // Notification Email Content
// export function generateNotificationContent({ clientName, notification }) {
//     if (!notification) {
//         return `
//             <p>Hi ${clientName || 'there'},</p>
//             <p>No notifications found at the moment.</p>
//         `;
//     }

//     return `
//         <p style="font-size: 18px; color: #555;">Hello, <strong>${clientName || 'there'}</strong>! 👋</p>
        
//         <p style="font-size: 16px;">We have an important update for you today:</p>
        
//         <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 25px 0;">
        
//         <h2 style="color: #2c3e50; font-size: 24px; margin-top: 0;">${notification.title}</h2>
        
//         <p style="font-size: 16px; color: #555;">
//             ${notification.description || ""}
//         </p>
        
//         ${notification.auto_chat ? `
//         <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 15px 0;">
//             <tr>
//                 <td style="background-color: #f0f0f0; padding: 15px; border-radius: 5px; border-left: 4px solid #03989F;">
//                     <p style="margin: 0; font-style: italic; color: #555;">${notification.auto_chat}</p>
//                 </td>
//             </tr>
//         </table>
//         ` : ''}
        
//         ${notification.url ? `
//         <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 25px 0;">
        
//         <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top: 30px;">
//             <tr>
//                 <td align="center">
//                     <a href="${notification.url}" style="display: inline-block; padding: 14px 28px; margin: 5px; background-color: #03989F; color: #ffffff; text-decoration: none; border-radius: 5px; font-weight: bold;">Learn More</a>
//                 </td>
//             </tr>
//         </table>
//         ` : ''}
//     `;
// }


export function generateSuccessStoryContent({ clientName, story }) {
    if (!story) {
        return `
            <p>Hi ${clientName ? `<strong>${clientName}</strong>` : 'there'},</p>
            <p>No success stories found for this condition at the moment.</p>
        `;
    }

    return `
        <p style="font-size: 18px; color: #555;">Hey ${clientName ? `<strong>${clientName}</strong>` : 'there'}! 👋</p>
        
        <p style="font-size: 16px;">We wanted to share an inspiring success story with you today. Real people, real results!</p>
        
        <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 25px 0;">
        
        <p style="font-size: 16px; font-style: italic; color: #555; padding: 15px; background-color: #f9f9f9; border-left: 4px solid #03989F;">
            ${story.short_descriptions || ""}
        </p>
        
        <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 25px 0;">
        
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top: 30px;">
            <tr>
                <td align="center">
                    <a href="${story.web_link}" style="display: inline-block; padding: 10px 20px; margin: 5px; background-color: #03989F; color: #ffffff; text-decoration: none; border-radius: 5px; font-size: 14px;">Read Full Story</a>
                    <a href="${story.app_link}" style="display: inline-block; padding: 10px 20px; margin: 5px; background-color: #FFB513; color: #ffffff; text-decoration: none; border-radius: 5px; font-size: 14px;">Open in App</a>
                </td>
            </tr>
        </table>
    `;
}

// Blog Email Content
export function generateBlogContent({ clientName, blog }) {
    if (!blog) {
        return `
            <p>Hi ${clientName || 'there'},</p>
            <p>No blogs found for this condition at the moment.</p>
        `;
    }

    return `
        <p style="font-size: 18px; color: #555;">Hi there, <strong>${clientName || 'there'}</strong>! 📖</p>
        
        <p style="font-size: 16px;">Here's today's featured health article that we think you'll find valuable:</p>
        
        <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 25px 0;">
        
        <h2 style="color: #2c3e50; font-size: 24px; margin-top: 0;">${blog.postTitle}</h2>
        
        <p style="font-size: 16px; color: #555;">
            ${blog.postDesc || ""}
        </p>
        
        <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 25px 0;">
        
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top: 30px;">
            <tr>
                <td align="center">
                    <a href="${blog.web_link}" style="display: inline-block; padding: 14px 28px; margin: 5px; background-color: #03989F; color: #ffffff; text-decoration: none; border-radius: 5px; font-weight: bold;">Read Full Article</a>
                    <a href="${blog.app_link}" style="display: inline-block; padding: 14px 28px; margin: 5px; background-color: #FFB513; color: #ffffff; text-decoration: none; border-radius: 5px; font-weight: bold;">Open in App</a>
                </td>
            </tr>
        </table>
    `;
}

// Social Post Email Content
export function generateSocialPostContent({ clientName, post }) {
    if (!post) {
        return `
            <p>Hi ${clientName || 'there'},</p>
            <p>No social posts found for this condition at the moment.</p>
        `;
    }

    return `
        <p style="font-size: 18px; color: #555;">Hey, <strong>${clientName || 'there'}</strong>! ✨</p>
        
        <p style="font-size: 16px;">Check out this post we shared today on our social media. Here's a quick tip for you:</p>
        
        <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 25px 0;">
        
        ${post.title ? `<h2 style="color: #2c3e50; font-size: 24px; margin-top: 0;">${post.title}</h2>` : ''}
        
        ${post.description ? `<p style="font-size: 16px; color: #555;">${post.description}</p>` : ''}
        
        ${post.image_link ? `
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 20px 0;">
            <tr>
                <td align="center">
                    <img src="${post.image_link}" alt="Post Image" style="max-width: 100%; height: auto; border-radius: 8px; display: block;" />
                </td>
            </tr>
        </table>
        ` : ''}
        
        <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 25px 0;">
        
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top: 30px;">
            <tr>
                <td align="center">
                    ${post.balance_nutrition_link ? `<a href="${post.balance_nutrition_link}" style="display: inline-block; padding: 14px 28px; margin: 5px; background-color: #03989F; color: #ffffff; text-decoration: none; border-radius: 5px; font-weight: bold;">View on Balance Nutrition</a>` : ''}
                    ${post.khyati_rupani_link ? `<a href="${post.khyati_rupani_link}" style="display: inline-block; padding: 14px 28px; margin: 5px; background-color: #FFB513; color: #ffffff; text-decoration: none; border-radius: 5px; font-weight: bold;">View on Khyati Rupani</a>` : ''}
                </td>
            </tr>
        </table>
    `;
}

// Notification Email Content
export function generateNotificationContent({ clientName, notification }) {
    if (!notification) {
        return `
            <p>Hi ${clientName || 'there'},</p>
            <p>No notifications found at the moment.</p>
        `;
    }

    return `
        <p style="font-size: 18px; color: #555;">Hello, <strong>${clientName || 'there'}</strong>! 👋</p>
        
        <p style="font-size: 16px;">We have an important update for you today:</p>
        
        <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 25px 0;">
        
        <h2 style="color: #2c3e50; font-size: 24px; margin-top: 0;">${notification.title}</h2>
        
        <p style="font-size: 16px; color: #555;">
            ${notification.description || ""}
        </p>
        
        ${notification.auto_chat ? `
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 15px 0;">
            <tr>
                <td style="background-color: #f0f0f0; padding: 15px; border-radius: 5px; border-left: 4px solid #03989F;">
                    <p style="margin: 0; font-style: italic; color: #555;">${notification.auto_chat}</p>
                </td>
            </tr>
        </table>
        ` : ''}
        
        ${notification.url ? `
        <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 25px 0;">
        
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top: 30px;">
            <tr>
                <td align="center">
                    <a href="${notification.url}" style="display: inline-block; padding: 14px 28px; margin: 5px; background-color: #03989F; color: #ffffff; text-decoration: none; border-radius: 5px; font-weight: bold;">Learn More</a>
                </td>
            </tr>
        </table>
        ` : ''}
    `;
}