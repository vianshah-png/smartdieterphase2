//
export function generateAutoCartCreationMessageTemplates(name, cartItems, cartLink, mentorWa) {
  const total = cartItems.reduce((sum, i) => sum + Number(i.price_per_unit*i.quantity || 0), 0);

  const renderItems = () => {
    return cartItems
      .map(i => `${i.product_name} – (₹${i.price_per_unit} x ${i.quantity}) = ₹${i?.total_price}`)
      .join("<br>");
  };

  const templates = {
      instant: `
       <p>Hi <b>${name}</b>,</p>
       <p>As per your request, we’ve added the products you selected and created your cart</p>
       <p><b>Cart Summary:</b><br>
       ${renderItems()}<br>
       <b>Total Amount:</b> ₹${total}
       </p>
       <p><b>Click here to order</b> <a href=${cartLink} target='_blank'><u>${cartLink}</u></a></p>
       <p>P.S. If you need help or have any questions, feel free to reach out to me on <a href="https://wa.me/${mentorWa}">${mentorWa}</a></p>`,

      reminder: `<p>Hi <b>${name}</b>,</p>
       <p>Your selected products are still saved for you.</p>
       <p><b>Your Selected Items:</b></p>
       ${renderItems()}
       <p><b>Total Amount:</b> ₹${total}</p>
      <p>Click here to order <a href=${cartLink} target='_blank'><u>${cartLink}</u></a></p>
      <p>P.S. If you need help or have any questions, feel free to reach out to me on <a href="https://wa.me/${mentorWa}">${mentorWa}</a></p>`
  };

  return {
    instant: templates.instant.trim(),
    reminder: templates.reminder.trim()
  };
}

function generateItemsHTML(cartItems) {
  return cartItems.map(ci => `
    <li style="margin-bottom:6px;">
      <span style="font-weight:600;">${ci.product_name} – (₹${ci.price_per_unit} x ${ci.quantity}) = ₹${ci?.total_price}</span>
    </li>
  `).join("");
}

const templates = {
  instant: {
  subject: "Your BN Shop Cart is Ready!",
  body: (name, itemsHTML, total, cartLink, designation, mentor_wa, mentor_name) => `
    <p style="font-size:15px;">Hi <b>${name}</b>,</p>

    <p style="font-size:15px;">As per your request, we’ve added the products you selected and created your cart.</p>

    <p style="font-size:15px; font-weight:600;">Cart Summary:</p>
    <ul style="padding-left:18px; font-size:15px;">${itemsHTML}</ul>

    <p style="font-size:15px;"><b>Total Amount:</b> ₹${total}</p>

    <p style="font-size:15px;"> <b>Click here to order</b> : <a href="${cartLink}">${cartLink}</a></p>

    <p style="font-size:15px;">If you need help or have any questions, feel free to reach out to ${designation} ${mentor_name} at  <a href="https://wa.me/${mentor_wa}">${mentor_wa}</a>.</p>
    <p style="font-size:15px;">Warm regards,<br>Team Balance Nutrition</p>
  `
},

reminder: {
  subject: "A Quick Reminder to Check Your BN Cart!",
  body: (name, itemsHTML, total, cartLink, designation, mentor_wa, mentor_name) => `
    <p style="font-size:15px;">Hi <b>${name}</b>,</p>

    <p style="font-size:15px;">Just a gentle reminder that your BN cart with your selected products is lying unused. <br> Please check it & complete your order.</p>

    <p style="font-size:15px; font-weight:600;">Your Cart Summary:</p>
    <ul style="padding-left:18px; font-size:15px;">${itemsHTML}</ul>

    <p style="font-size:15px;"><b>Total Amount:</b> ₹${total}</p>

    <p style="font-size:15px;"><b>Click here to order</b> : <a href="${cartLink}">${cartLink}</a></p>

    <p style="font-size:15px;">If you need help or have any questions, feel free to reach out to ${designation} ${mentor_name} at <a href="https://wa.me/${mentor_wa}">${mentor_wa}</a>.</p>

    <p style="font-size:15px;">Warm regards,<br>Team Balance Nutrition</p>
  `
}
 
};

export function getInstantEmailTemplate({ name, cartItems, cartLink, designation, mentor_wa, mentor_name }) {
  const itemsHTML = generateItemsHTML(cartItems);
  const total = cartItems.reduce((sum, c) => sum + Number(c.price_per_unit*c.quantity), 0);

  const template = templates.instant;
  return {
    subject: template.subject,
    body: template.body(name, itemsHTML, total, cartLink, designation, mentor_wa, mentor_name)
  };
}

export function get48HourEmailTemplate({ name, cartItems, cartLink, designation, mentor_wa, mentor_name }) {
  const itemsHTML = generateItemsHTML(cartItems);
  const total = cartItems.reduce((sum, c) => sum + Number(c.price_per_unit*c.quantity), 0);

  const template = templates.reminder;
  return {
    subject: template.subject,
    body: template.body(name, itemsHTML, total, cartLink, designation, mentor_wa, mentor_name)
  };
}

export function buildCartWhatsappMessages(cart_items, userDetail, cartData) {
  let totalAmount = 0;

  // Prepare items list
  const itemsString = cart_items
    .map(item => {
      const lineTotal = item.price_per_unit * item.quantity;
      totalAmount += lineTotal;
      return `${item.product_name} | Qty: ${item.quantity} | ₹${lineTotal}`;
    })
    .join("   |   ");

  // Abandoned Cart Message
  const abandonedCartMessage = 
`Hi ${userDetail.client_name},
I just wanted to check up on your BN Snack & Dessert order Cart that you created. If you are having payment issues, do write back to me. 

Here’s a quick look at your cart again:
${itemsString}
Total Amount: *₹${totalAmount}*

*Click here to Pay Now*: https://balancenutrition.in/shop?share=cc-${cartData?.cart_id}`;

  // Share Cart Link Message
  const shareCartLinkMessage = 
`Hi ${userDetail.client_name},
I just wanted to check up on your BN Snack & Dessert order Cart that I had created for you. If you are having payment issues, do write back to me. 

Here’s a quick look at your cart again: 
${itemsString}
Total Amount: *₹${totalAmount}*

Click here to check your Cart: https://balancenutrition.in/shop?share=${cartData?.cart_code}`;

  return {
    abandonedCartMessage,
    shareCartLinkMessage
  };
}

export function buildCartAutodraft(cart_items, client_name, cart_code) {
  let totalAmount = 0;

  // Prepare items list
  const itemsString = cart_items
    .map(item => {
      const lineTotal = item.price_per_unit * item.quantity;
      totalAmount += lineTotal;
      return `${item.product_name} | Qty: ${item.quantity} | ₹${lineTotal}`;
    })
    .join("   |   ");

  // Abandoned Cart Message
  const abandonedCartMessage = 
`<p><b>Abandoned Cart Draft</b></p>
<p>Hi ${client_name},</p>
<p>I just wanted to check up on your BN Snack & Dessert order Cart that you created. If you are having payment issues, do write back to me. </p>
<p>Here’s a quick look at your cart again:</p>
<p>${itemsString}</p>
<p>Total Amount: <b>₹${totalAmount}</b>
<p><b>Click here to Pay Now</b>: <a href="https://balancenutrition.in/shop?share=cc-${cart_code}">https://balancenutrition.in/shop?share=cc-${cart_code}</a></p>`;

  // Share Cart Link Message
  const shareCartLinkMessage = 
`<p><b>Shared Cart Link Draft</b></p>
<p>Hi ${client_name},</p>
<p>I just wanted to check up on your BN Snack & Dessert order Cart that I had created for you. If you are having payment issues, do write back to me.</p>
<p>Here’s a quick look at your cart again:</p>
<p>${itemsString}</p>
<p>Total Amount: <b>₹${totalAmount}</b></p>
<p>
  <b>Click here to check your Cart:</b>
  <a href="https://balancenutrition.in/shop?share=${cart_code}">
    https://balancenutrition.in/shop?share=${cart_code}
  </a>
</p>`
;

  return {
    abandonedCartMessage,
    shareCartLinkMessage
  };
}

// Diet Cart Autochat Message templates
export const generateDietCartAutoChat = ({
  clientName,
  dietSessionName,
  dietSessionLink,
  orderLink,
  cartItems = []
}) => {

  console.log(clientName, dietSessionName, dietSessionLink, orderLink, cartItems, 'generateDietAutoChat')
  const cartItemsHTML = cartItems.length
    ? cartItems
        .map(
          item => `
            <li>
              <strong>${item.product_name}</strong>
              ${item.pack_size ? ` – ${item.pack_size}` : ""}
              ${item.quantity ? ` X ${item.quantity}` : ""}
              ${item.total_price ? ` – ₹${item.total_price}` : ""}
            </li>
          `
        )
        .join("")
    : `<li>No items added yet</li>`;

  return `
    <p>Hi <strong>${clientName}</strong>,</p>

    <p>
      I hope you’ve checked the 
      <strong>
        <a href="${dietSessionLink}" target="_blank" rel="noopener noreferrer">
           diet session ${dietSessionName}
        </a>
      </strong>
      I just shared with you a while ago.
    </p>
    <p>
      To make things easy for you, I’ve added the products you’ll need from the 
      <strong>BN Shop</strong> for this session.
    </p>

    <br>
    <p><strong>🛒 Your Auto-Cart Includes:</strong></p>
     <ul>
      ${cartItemsHTML}
    </ul>

    <br><p>
      👉 <strong>
        <a href="${orderLink}" target="_blank" style="text-decoration:underline;" rel="noopener noreferrer">
          Click here to order
        </a>
      </strong>
    </p><br>

    <p>
      These products are <strong>low-calorie & healthier alternatives</strong>
      compared to what’s commonly available in the market, making it easier
      for you to follow the diet consistently.
    </p>

    <p>
      You can <strong>edit the cart</strong> and <strong>change quantities</strong>
      as per your preference.
    </p>

    <p>
      Let me know if you need any help with this 😊
    </p>
  `;
};

export const generateDietCartAutoChatFor45Min = ({
  clientName,
  orderLink,
}) => {

  return `
    <p>Hi <strong>${clientName}</strong>,</p>

    <p>
      Just a reminder that your. 
      <strong>
        diet-specific product cart from the BN Shop is already created
      </strong>
    </p>
    <br><p>
      <strong>
        <a href="${orderLink}" target="_blank" style="text-decoration:underline;" rel="noopener noreferrer">
          To order now. Click here
        </a>
      </strong>
    </p><br>
  `;
};

// Diet Cart Email Message Template 
export function generateDietShoppingEmail1hr({
    clientName,
    sessionNumber,
    sessionLink,
    products,
    orderLink,
}) {
    const productListItems = products.map(product => 
        `<li style="margin-bottom: 10px;">${product.product_name} – ${product.pack_size} –  Qty:${product.quantity} - ${product.total_price}</li>`
    ).join('\n                                ');

    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Your Diet Shopping List Is Ready</title>
</head>
<body>
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
            <td align="center" bgcolor="#f5f5f5" style="padding: 20px;">
                <table width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff">
                    <tr>
                        <td style="padding: 40px; font-family: Arial, sans-serif; color: #333333; line-height: 1.6;">
                            
                            <p>Hi <strong>${clientName}</strong>,</p>
                            
                            <p>I hope you've had a chance to check <strong><a href="${sessionLink}">Diet Session ${sessionNumber}</a></strong> that I shared with you a while ago.</p>
                            
                            <p>To make things easier for you, I've already added the essential products you'll need for this session to your <strong>BN Shop auto-cart</strong>.</p>
                            
                            <p style="font-weight: bold; margin-top: 25px; margin-bottom: 10px;">Your Auto-Cart Includes:</p>
                            
                            <ul style="margin-left: 20px;">
                                ${productListItems}
                            </ul>
                            
                            <p style="font-weight: bold; margin-top: 25px;"><a href="${orderLink}">Click here to order</a></p>
                            
                            <p>These products are <strong>low-calorie, healthier alternatives</strong> to what is available in the market, making it easier to follow your diet plan consistently.</p>
                            
                            <p>You're free to <strong>edit the cart or adjust quantities</strong>.</p>
                            
                            <p>If you need any help or have questions, just let me know. I'm here for you</p>
                            
                            <p style="margin-top: 30px;">Warm regards,<br>
                            <strong>Balance Nutrition</strong></p>
                            
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;
}


export function generateDietShoppingReminderEmail45min({
    clientName,
    sessionNumber,
    orderLink,
}) {
    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Reminder: Your Diet Shopping List</title>
</head>
<body>
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
            <td align="center" bgcolor="#f5f5f5" style="padding: 20px;">
                <table width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff">
                    <tr>
                        <td style="padding: 40px; font-family: Arial, sans-serif; color: #333333; line-height: 1.6;">
                            
                            <p>Hi <strong>${clientName}</strong>,</p>
                            
                            <p>Just a quick reminder that your <strong>diet-specific shopping cart for Session ${sessionNumber}</strong> is already created and ready for checkout.</p>
                            
                            <p style="font-weight: bold; margin-top: 25px;"><a href="${orderLink}">Click here to Order Now</a></p>
                            
                            <p>Having these items ready in advance will make your diet easier to follow.</p>
                            
                            <p>Let me know if you need any help.</p>
                            
                            <p style="margin-top: 30px;">Warm regards,<br>
                            <strong>Balance Nutrition</strong></p>
                            
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;
}