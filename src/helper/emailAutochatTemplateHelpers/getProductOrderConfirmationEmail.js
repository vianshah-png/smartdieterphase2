import { getComboInclusions } from "../commonHelper.js";


// FOR KB AND NORMAL WEIGHT SCALE ORDER HELPER
const generateProductRows = (items) => {
  let rows = '';

  items.forEach((item) => {
    const comboItems = getComboInclusions(item.product_name, item.pack_size);

    let productNameHtml = `<strong>${item.product_name}</strong>`;

    if (comboItems && comboItems.length > 0) {
      const inclusionsList = comboItems.join(', ');
      productNameHtml += `<br/><span style="font-size: 12px; color: #666; font-style: italic;">Inclusions: ${inclusionsList}</span>`;
    }

    rows += `
      <tr>
        <td style="border: 1px solid #ddd; padding: 8px; text-align: left; vertical-align: top; word-wrap: break-word; font-size: 14px;">
          ${productNameHtml}
        </td>
        <td style="border: 1px solid #ddd; padding: 8px; text-align: center; white-space: nowrap; font-size: 14px;">${item.pack_size}</td>
        <td style="border: 1px solid #ddd; padding: 8px; text-align: center; font-size: 14px;">${item.quantity}</td>
        <td style="border: 1px solid #ddd; padding: 8px; text-align: center; white-space: nowrap; font-size: 14px;">${INR(item.price_per_unit)}</td>
        <td style="border: 1px solid #ddd; padding: 8px; text-align: center; white-space: nowrap; font-size: 14px;">${INR(item.total_price)}</td>
      </tr>
    `;
  });

  return rows;
};

const INR = (n) => `₹${Number(n).toFixed(2)}`;

export const generateOrderConfirmationEmail = (orderData, orderId, razorpay_payment_id, items, grandTotal, attachments) => {
  return {
    html: `
    <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
    <html xmlns="http://www.w3.org/1999/xhtml">
    <head>
      <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
      <title>Order Confirmation</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%;">
      <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f4f4f4;">
        <tr>
          <td align="center" style="padding: 20px 10px;">
            <table border="0" cellpadding="0" cellspacing="0" width="600" style="max-width: 600px; background-color: #ffffff;">
              <tr>
                <td style="padding: 20px; color: #333; line-height: 1.6;">
                  
                  <p style="margin: 0 0 15px 0; font-size: 14px;">Dear <strong>${orderData.customer_name}</strong>,</p>
              
                  <p style="margin: 0 0 15px 0; font-size: 14px;">Thank you for your order with <strong>Balance Nutrition</strong>!</p>
                  <p style="margin: 0 0 15px 0; font-size: 14px;">Your payment has been successfully received and your order is confirmed. Below are the details:</p>
              
                  <h3 style="margin: 20px 0 10px 0; font-size: 16px; color: #333;">Order Details:</h3>
                  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 0 0 15px 0;">
                    <tr><td style="padding: 5px 0; font-size: 14px;"><strong>Master Order ID:</strong> ${orderId}</td></tr>
                    <tr><td style="padding: 5px 0; font-size: 14px;"><strong>Payment Method:</strong> ONLINE</td></tr>
                    <tr><td style="padding: 5px 0; font-size: 14px;"><strong>Razorpay Payment ID:</strong> ${razorpay_payment_id}</td></tr>
                    <tr><td style="padding: 5px 0; font-size: 14px;"><strong>Total Amount:</strong> ${INR(grandTotal)}</td></tr>
                  </table>
              
                  <h3 style="margin: 20px 0 10px 0; font-size: 16px; color: #333;">Shipping Details:</h3>
                  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 0 0 15px 0;">
                    <tr><td style="padding: 5px 0; font-size: 14px;"><strong>Address:</strong> ${orderData.customer_address}, ${orderData.customer_city}, ${orderData.customer_state}, ${orderData.customer_country} - ${orderData.customer_pincode}</td></tr>
                    <tr><td style="padding: 5px 0; font-size: 14px;"><strong>Landmark:</strong> ${orderData.customer_landmark || "-"}</td></tr>
                    <tr><td style="padding: 5px 0; font-size: 14px;"><strong>Contact:</strong> ${orderData.customer_phone || "-"}</td></tr>
                  </table>
              
                  <h3 style="margin: 20px 0 10px 0; font-size: 16px; color: #333;">Products Ordered:</h3>
                  
                  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse; margin: 10px 0;">
                    <thead>
                      <tr style="background-color: #f2f2f2;">
                        <th style="border: 1px solid #ddd; padding: 8px; text-align: center; font-size: 14px; width: 40%;">Product Name</th>
                        <th style="border: 1px solid #ddd; padding: 8px; text-align: center; font-size: 14px; width: 15%;">Pack Size</th>
                        <th style="border: 1px solid #ddd; padding: 8px; text-align: center; font-size: 14px; width: 10%;">Qty</th>
                        <th style="border: 1px solid #ddd; padding: 8px; text-align: center; font-size: 14px; width: 17.5%;">Price/Unit</th>
                        <th style="border: 1px solid #ddd; padding: 8px; text-align: center; font-size: 14px; width: 17.5%;">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${generateProductRows(items)}
                    </tbody>
                  </table>
              
                  <p style="margin: 20px 0 15px 0; font-size: 14px;"><strong>We will dispatch your order within the next 24 hours.</strong></p>
                  <p style="margin: 0 0 15px 0; font-size: 14px;">For any queries, please contact <a href="mailto:accounts@balancenutrition.in" style="color: #0066cc;">accounts@balancenutrition.in</a></p>
              
                  <p style="margin: 20px 0 0 0; font-size: 14px;">Best regards,<br/><strong>Team Balance Nutrition</strong></p>
                  
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>`,
    attachments,
  };
};

export const generateFreeDrStoreConfirmationEmail = (orderData)=> {
 return {
  html: `
  <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
  <html xmlns="http://www.w3.org/1999/xhtml">
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
    <title>Balance Nutrition – Free Order Confirmation</title>
  </head>
  <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%;">
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f4f4f4;">
      <tr>
        <td align="center" style="padding: 20px 10px;">
          <table border="0" cellpadding="0" cellspacing="0" width="600" style="max-width: 600px; background-color: #ffffff;">
            <tr>
              <td style="padding: 20px; color: #333; line-height: 1.6;">
                
                <p style="margin: 0 0 15px 0; font-size: 14px;">
                  Dear <strong>${orderData.customer_name}</strong>,
                </p>

                <p style="margin: 0 0 15px 0; font-size: 14px;">
                  Thank you for your order with <strong>Balance Nutrition</strong>!
                </p>

                <p style="margin: 0 0 15px 0; font-size: 14px;">
                  Your free order has been successfully placed and is now confirmed. No payment was required for this order.
                </p>

                <h3 style="margin: 20px 0 10px 0; font-size: 16px; color: #333;">Order Details:</h3>
                <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 0 0 15px 0;">
                  <tr>
                    <td style="padding: 5px 0; font-size: 14px;">
                      <strong>Master Order ID:</strong> ${orderData.master_order_id}
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 5px 0; font-size: 14px;">
                      <strong>Order Type:</strong> Free Order
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 5px 0; font-size: 14px;">
                      <strong>Total Amount:</strong> ₹0.00
                    </td>
                  </tr>
                </table>

                <h3 style="margin: 20px 0 10px 0; font-size: 16px; color: #333;">Shipping Details:</h3>
                <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 0 0 15px 0;">
                  <tr>
                    <td style="padding: 5px 0; font-size: 14px;">
                      <strong>Address:</strong> ${orderData.customer_address}, ${orderData.customer_city}, ${orderData.customer_state}, ${orderData.customer_country} - ${orderData.customer_pincode}
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 5px 0; font-size: 14px;">
                      <strong>Landmark:</strong> ${orderData.customer_landmark || "-"}
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 5px 0; font-size: 14px;">
                      <strong>Contact:</strong> ${orderData.customer_phone || "-"}
                    </td>
                  </tr>
                </table>

                <h3 style="margin: 20px 0 10px 0; font-size: 16px; color: #333;">Products Included:</h3>

                <table border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse; margin: 10px 0;">
                  <thead>
                    <tr style="background-color: #f2f2f2;">
                      <th style="border: 1px solid #ddd; padding: 8px; text-align: center; font-size: 14px; width: 35%;">Product Name</th>
                      <th style="border: 1px solid #ddd; padding: 8px; text-align: center; font-size: 14px; width: 10%;">Qty</th>
                      <th style="border: 1px solid #ddd; padding: 8px; text-align: center; font-size: 14px; width: 15%;">Price</th>
                      <th style="border: 1px solid #ddd; padding: 8px; text-align: center; font-size: 14px; width: 15%;">Discount</th>
                      <th style="border: 1px solid #ddd; padding: 8px; text-align: center; font-size: 14px; width: 15%;">Net Price</th>
                    </tr>
                  </thead>
                  <tbody>
                     <tr>
                     <td style="border: 1px solid #ddd; padding: 8px; text-align: left; vertical-align: top; word-wrap: break-word; font-size: 14px;">
                       BN BodyScan Smart Body Scale
                     </td>
                     <td style="border: 1px solid #ddd; padding: 8px; text-align: center; white-space: nowrap; font-size: 14px;">1</td>
                     <td style="border: 1px solid #ddd; padding: 8px; text-align: center; font-size: 14px;">₹2999.00</td>
                     <td style="border: 1px solid #ddd; padding: 8px; text-align: center; white-space: nowrap; font-size: 14px;">₹2999.00</td>
                     <td style="border: 1px solid #ddd; padding: 8px; text-align: center; white-space: nowrap; font-size: 14px;">₹0.00</td>
                   </tr>
                  </tbody>
                </table>

                <p style="margin: 0 0 15px 0; font-size: 14px;">
                  For any queries, please contact 
                  <a href="mailto:accounts@balancenutrition.in" style="color: #0066cc;">
                    accounts@balancenutrition.in
                  </a>
                </p>

                <p style="margin: 20px 0 0 0; font-size: 14px;">
                  Best regards,<br/>
                  <strong>Team Balance Nutrition</strong>
                </p>

              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
  </html>`,
};

}