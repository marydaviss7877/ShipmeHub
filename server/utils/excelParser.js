const XLSX = require('xlsx');

/**
 * Parse Excel file to calculate label quantity
 * Based on the specific format with sender/recipient information
 */
const parseLabelQuantity = (fileBuffer) => {
  try {
    // Read the Excel file
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Convert to JSON
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    
    if (data.length < 2) {
      throw new Error('File must contain at least a header row and one data row');
    }
    
    // Expected headers based on the format shown
    const expectedHeaders = [
      '客户订单号', 'Customer Order No.',
      '产品名称', 'Product Name',
      '发件人姓名', 'sender\'s name',
      '发件人国家', 'sender\'s country',
      '发件人城市', 'sender city',
      '发件人省/州', 'Sender\'s province/state',
      '发件人邮编', 'sender\'s postal code',
      '发件人地址', 'sender\'s address',
      '收件人姓名', 'Recipient\'s Name',
      '收件人国家', 'recipient\'s country',
      '收件人城市', 'recipient city',
      '收件人省/州', 'Recipient\'s province/state',
      '收件人邮编', 'zip code of recipient',
      '收件人电话', 'Recipient\'s phone',
      '收件人地址1', 'Recipient address 1',
      '收件人地址2', 'Recipient address 2',
      '长(cm)', 'Length (cm)',
      '宽(cm)', 'Width (cm)',
      '高(cm)', 'Height (cm)',
      '重量(KG)', 'Weight (KG)',
      '备注', 'Note',
      '中文品名1', 'Chinese Product Name 1',
      '英文品名1', 'English Product Name 1',
      '数量1', 'Quantity 1'
    ];
    
    const headers = data[0];
    const dataRows = data.slice(1);
    
    // Validate headers
    const hasRequiredHeaders = expectedHeaders.some(header => 
      headers.some(h => h && h.toString().toLowerCase().includes(header.toLowerCase()))
    );
    
    if (!hasRequiredHeaders) {
      throw new Error('File format does not match expected shipping label format');
    }
    
    // Calculate total labels needed
    let totalLabels = 0;
    const shipments = [];
    
    dataRows.forEach((row, index) => {
      if (row.length === 0 || row.every(cell => !cell)) return; // Skip empty rows
      
      // Find quantity column (look for "数量" or "Quantity")
      let quantityIndex = -1;
      headers.forEach((header, idx) => {
        if (header && (
          header.toString().toLowerCase().includes('数量') ||
          header.toString().toLowerCase().includes('quantity')
        )) {
          quantityIndex = idx;
        }
      });
      
      // If no quantity column found, assume 1 label per row
      const quantity = quantityIndex >= 0 && row[quantityIndex] ? 
        parseInt(row[quantityIndex]) || 1 : 1;
      
      totalLabels += quantity;
      
      // Extract shipment details
      const shipment = {
        rowIndex: index + 2, // +2 because we skipped header row and arrays are 0-indexed
        quantity,
        senderName: row[2] || '', // 发件人姓名
        recipientName: row[8] || '', // 收件人姓名
        recipientCountry: row[9] || '', // 收件人国家
        recipientCity: row[10] || '', // 收件人城市
        weight: row[19] || 0, // 重量(KG)
        dimensions: {
          length: row[16] || 0, // 长(cm)
          width: row[17] || 0,  // 宽(cm)
          height: row[18] || 0  // 高(cm)
        }
      };
      
      shipments.push(shipment);
    });
    
    return {
      totalLabels,
      totalShipments: shipments.length,
      shipments,
      headers,
      isValid: true
    };
    
  } catch (error) {
    console.error('Error parsing Excel file:', error);
    return {
      totalLabels: 0,
      totalShipments: 0,
      shipments: [],
      headers: [],
      isValid: false,
      error: error.message
    };
  }
};

/**
 * Validate if file has the correct format for label calculation
 */
const validateLabelFile = (fileBuffer, filename) => {
  const result = parseLabelQuantity(fileBuffer);
  
  if (!result.isValid) {
    return {
      isValid: false,
      error: result.error || 'Invalid file format'
    };
  }
  
  if (result.totalLabels === 0) {
    return {
      isValid: false,
      error: 'No valid shipments found in the file'
    };
  }
  
  return {
    isValid: true,
    totalLabels: result.totalLabels,
    totalShipments: result.totalShipments
  };
};

module.exports = {
  parseLabelQuantity,
  validateLabelFile
};
