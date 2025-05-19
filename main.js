document.addEventListener('DOMContentLoaded', function() {
    // Bên trong DOMContentLoaded listener
    const closeButton = document.getElementById('popup-close-button');
    if (closeButton) {
        closeButton.addEventListener('click', closePopup);
    }
    const apiKeyInput = document.getElementById('api-key');
    const form = document.getElementById('generation-form');
    const imageInput1 = document.getElementById('image1');
    const imageInput2 = document.getElementById('image2');
    const promptInput = document.getElementById('prompt');
    const numRequestsSlider = document.getElementById('num-requests');
    const sliderValueSpan = document.getElementById('slider-value');
    const submitButton = document.getElementById('submit-button');
    const statusDiv = document.getElementById('status');
    const galleryDiv = document.getElementById('gallery');
    const modelSelect = document.getElementById('model-select');

        
    // Update slider value display
    numRequestsSlider.addEventListener('input', (event) => {
        sliderValueSpan.textContent = event.target.value;
    });

    // --- Helper Functions ---

    /**
     * Reads a File object and returns its base64 representation (without data URI prefix).
     * @param {File} file The file object.
     * @returns {Promise<string|null>} Base64 string or null if error.
     */
    function readFileAsBase64(file) {
        return new Promise((resolve, reject) => {
            if (!file) {
                resolve(null); // Resolve with null if no file provided
                return;
            }
            const reader = new FileReader();
            reader.onload = () => {
                // Result includes "data:image/jpeg;base64," prefix, remove it
                const base64String = reader.result.split(',')[1];
                resolve(base64String);
            };
            reader.onerror = (error) => {
                console.error("File reading error:", error);
                setStatus(`Error reading file: ${file.name}`, true);
                reject(null); // Reject on error
            };
            reader.readAsDataURL(file);
        });
    }

    /**
     * Sets the status message and style.
     * @param {string} message The message to display.
     * @param {boolean} isError If true, use error styling. If null, use success. Otherwise, use loading.
     */
    function setStatus(message, isError = false) {
        statusDiv.textContent = message;
        statusDiv.style.display = 'block';
        statusDiv.className = isError === true ? 'error' : (isError === false ? 'loading' : 'success');
            if (isError !== false) { // Keep error/success messages visible
            submitButton.disabled = false;
            }
    }

    /**
     * Clears the status message.
     */
    function clearStatus() {
            statusDiv.textContent = '';
            statusDiv.style.display = 'none';
            statusDiv.className = '';
    }

    /**
     * Parses retry delay from Gemini 429 error message.
     * Tries to find the JSON structure mentioned in the Python code.
     * @param {string} errorMessage The error message string.
     * @returns {number|null} Retry delay in seconds, or null if not found/parsed.
     */
    function parseRetryDelay(errorMessage) {
            try {
                // Attempt to find the JSON part after "RESOURCE_EXHAUSTED."
                const jsonMatch = errorMessage.match(/RESOURCE_EXHAUSTED\.\s*(\{.*\})/);
                if (jsonMatch && jsonMatch[1]) {
                    const errorDetails = JSON.parse(jsonMatch[1]);
                    // Look for retryDelay in the details array
                    const delayInfo = errorDetails?.error?.details?.find(d => d.retryDelay);
                    if (delayInfo && typeof delayInfo.retryDelay === 'string') {
                        const seconds = parseInt(delayInfo.retryDelay.replace('s', ''), 10);
                        if (!isNaN(seconds)) {
                            return seconds;
                        }
                    }
                }
                // Fallback: Look for "retry after X seconds" type messages if the JSON parse fails
                const retryMatch = errorMessage.match(/retry after (\d+)\s*seconds?/i);
                if (retryMatch && retryMatch[1]) {
                return parseInt(retryMatch[1], 10);
                }
            } catch (e) {
                console.error("Error parsing retry delay:", e);
            }
            return null; // Return null if parsing fails
        }

    // --- Các hàm xử lý Popup (đặt bên ngoài scope if/else) ---
    function openPopup(imgDataUrl, index) {
        const popup = document.getElementById('imagePopup');
        const popupImage = document.getElementById('popupImage');
        const popupDownloadLink = document.getElementById('popupDownloadLink');

        if (popup && popupImage && popupDownloadLink) {
            popupImage.src = imgDataUrl;
            popupImage.alt = `Generated Image ${index + 1}`; // Cập nhật alt text
            popupDownloadLink.href = imgDataUrl;
            popupDownloadLink.download = `generated_image_${index + 1}.png`; // Đặt tên file download duy nhất
            popup.style.display = 'flex'; // Hiển thị popup (sử dụng flex để căn giữa)

            // Optional: Đóng popup khi click ra ngoài ảnh (vào overlay)
            popup.onclick = function(event) {
                if (event.target === popup) { // Chỉ đóng khi click trực tiếp vào overlay
                    closePopup();
                }
            };
        } else {
            console.error("Popup elements not found!");
        }
    }
    function closePopup() {
        const popup = document.getElementById('imagePopup');
        if (popup) {
            popup.style.display = 'none';
            // Ngăn chặn sự kiện click lan truyền từ nút đóng lên overlay
            // (Đã xử lý bằng cách kiểm tra event.target trong openPopup)
            // popup.onclick = null; // Gỡ bỏ listener để tránh memory leak nếu cần
        }
    }

    // --- Main Form Submission Logic ---

    form.addEventListener('submit', async (event) => {
        event.preventDefault(); // Prevent default form submission

        const apiKey = apiKeyInput.value.trim();
        const promptText = promptInput.value.trim();
        const numRequests = parseInt(numRequestsSlider.value, 10);
        const selectedModel = modelSelect.value;
        const file1 = imageInput1.files[0];
        const file2 = imageInput2.files[0];

        if (!apiKey) {
            setStatus('API Key is required.', true);
            return;
        }
        if (!promptText) {
            setStatus('Prompt is required.', true);
            return;
        }
        if (!selectedModel) { // Check if a model is somehow not selected
            setStatus('Please select a generation model.', true);
            return;
        }

        submitButton.disabled = true;
        setStatus(`Reading images and preparing request...`, false);
        galleryDiv.innerHTML = ''; // Clear previous results

        let base64Image1 = null;
        let base64Image2 = null;

        try {
            [base64Image1, base64Image2] = await Promise.all([
                readFileAsBase64(file1),
                readFileAsBase64(file2)
            ]);
                // If any file read failed, readFileAsBase64 would have set an error status
                if (statusDiv.classList.contains('error')) {
                    submitButton.disabled = false;
                    return;
                }
        } catch (error) {
            // This catch might be redundant if readFileAsBase64 handles its own errors, but good for safety
            setStatus('An error occurred while reading image files.', true);
            submitButton.disabled = false;
            return;
        }


        const imageParts = [];
        const mimeType1 = file1 ? file1.type : 'image/jpeg'; // Default or get from file
        const mimeType2 = file2 ? file2.type : 'image/jpeg';

        if (base64Image1) {
            imageParts.push({ inline_data: { mime_type: mimeType1, data: base64Image1 } });
        }
        if (base64Image2) {
            imageParts.push({ inline_data: { mime_type: mimeType2, data: base64Image2 } });
        }

        // Construct the 'contents' array based on the number of images
        const contents = [];
        contents.push({ text: promptText }); // Text always goes first

        if (imageParts.length === 1) {
            // If exactly one image, add it directly
            contents.push(imageParts[0]);
        } else if (imageParts.length === 2) {
            // If two images, add them with labels (optional, but matches Python logic pattern)
            // Note: The API might just look for image parts regardless of structure here.
            // This matches the Python code's approach for >1 image.
            contents.push({text: "Image 1:"}); // API might not need these text separators
            contents.push(imageParts[0]);
            contents.push({text: "Image 2:"});
            contents.push(imageParts[1]);
        }
        // If 0 images, contents only contains the text part
        let responseModalities = ["Text"]
        if (selectedModel.includes("image")) {
            responseModalities = ["Image", "Text"]
        }
        const requestBody = {
            contents: [{ parts: contents }], // Gemini expects contents within a parts array
            generationConfig: {
                responseModalities: responseModalities
            }
        };

        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${apiKey}`;

        setStatus(`Sending ${numRequests} request(s) to Gemini...`, false);

        // --- API Call Function ---
        const callGemini = async (attempt = 1, maxRetries = 5, baseDelay = 2000) => {
            try {
                const response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(requestBody),
                });
                if (!response.ok) {
                        let errorMessage = `API Error: ${response.status} ${response.statusText}`;
                        let errorBody = null;
                        try {
                            errorBody = await response.json(); // Try to get more details
                            errorMessage += ` - ${JSON.stringify(errorBody)}`;
                        } catch (e) { /* Ignore if response body isn't JSON */ }

                        console.error("API Error Response:", errorMessage);

                        // Specific handling for 429 Too Many Requests
                        if (response.status === 429) {
                        if (attempt < maxRetries) {
                            const retryDelaySeconds = parseRetryDelay(errorMessage);
                            let waitTime = baseDelay * Math.pow(2, attempt -1); // Exponential backoff
                            if (retryDelaySeconds !== null) {
                                waitTime = retryDelaySeconds * 1000; // Use API suggested delay if available
                                setStatus(`Rate limit hit. Retrying after ${retryDelaySeconds} seconds... (Attempt ${attempt}/${maxRetries})`, false);
                            } else {
                                setStatus(`Rate limit hit. Retrying in ${waitTime / 1000} seconds... (Attempt ${attempt}/${maxRetries})`, false);
                            }

                            await new Promise(resolve => setTimeout(resolve, waitTime));
                            return callGemini(attempt + 1, maxRetries, baseDelay); // Retry
                        } else {
                            throw new Error(`Rate limit hit. Max retries (${maxRetries}) exceeded. ${errorMessage}`);
                        }
                        }

                        throw new Error(errorMessage); // Throw for other non-ok statuses
                }

                const data = await response.json();
                // Validate response structure (basic check)
                if (!data || !data.candidates || !data.candidates[0] || !data.candidates[0].content || !data.candidates[0].content.parts) {
                    console.warn("Unexpected API response structure:", data);
                        // Optionally retry for unexpected structure? Or just fail.
                        if (attempt < maxRetries) {
                            setStatus(`Received unexpected API response. Retrying in ${baseDelay / 1000}s... (Attempt ${attempt}/${maxRetries})`, false);
                            await new Promise(resolve => setTimeout(resolve, baseDelay));
                            return callGemini(attempt + 1, maxRetries, baseDelay); // Retry
                        }
                    throw new Error("Invalid or empty response received from API.");
                }
                // Extract image data (assuming PNG or JPEG)
                const generatedImages = [];
                const generatedTexts = [];
                for (const part of data.candidates[0].content.parts) {
                    console.log(part)
                    if (part?.inlineData?.data && part?.inlineData?.mimeType) {
                        // console.log("--",part.inline_data)
                            // Assuming PNG is the default, but could check mime_type if needed
                        const mimeType = part["inlineData"]["mimeType"] || 'image/png';
                        generatedImages.push(`data:${mimeType};base64,${part["inlineData"]["data"]}`);
                        // console.log(generatedImages)
                    }
                    if (part?.text) {
                        // console.log("--",part.inline_data)
                            // Assuming PNG is the default, but could check mime_type if needed
                        generatedTexts.push(`${part["text"]}`);
                    }
                }
                if (generatedImages.length>0) {
                    return generatedImages;
                }
                return generatedTexts;

            } catch (error) {
                console.error("Fetch error:", error);
                // Don't retry on general network errors here, but could add specific conditions
                    throw error; // Re-throw to be caught by Promise.all
            }
        };

        // --- Execute API Calls in Parallel ---
        const apiPromises = [];
        for (let i = 0; i < numRequests; i++) {
            apiPromises.push(callGemini()); // Add promise for each request
        }

        try {
            const results = await Promise.allSettled(apiPromises); // Use allSettled to get results even if some fail
            
            let allGeneratedImages = [];
            let allGeneratedTexts = [];
            let successfulRequests = 0;
            let failedRequests = 0;

            results.forEach((result, index) => {
                if (result.status === 'fulfilled' && Array.isArray(result.value)) {
                    let value = result.value[0];
                    console.log(result)
                    if (value.startsWith("data:") && value.includes(";base64,")) {
                        // Ảnh
                        allGeneratedImages = allGeneratedImages.concat(result.value);
                        successfulRequests++;
                    } else {
                        // Chữ
                        allGeneratedTexts = allGeneratedTexts.concat(result.value);
                        successfulRequests++;
                    }
                } else {
                    failedRequests++;
                    console.error(`Request ${index + 1} failed:`, result.reason);
                        // Optionally display individual request errors
                }
            });
            // --- Code xử lý kết quả của bạn (đã được sửa đổi) ---
            if (allGeneratedImages.length > 0 || allGeneratedTexts.length > 0) {
                let imageSuccessCount = 0;
                let textSuccessCount = 0;

                if (allGeneratedImages.length > 0) {
                    imageSuccessCount = allGeneratedImages.length;
                    // Duyệt qua từng ảnh
                    allGeneratedImages.forEach((imgDataUrl, index) => {
                        // Tạo container cho mỗi ảnh và nút
                        const imageContainer = document.createElement('div');
                        imageContainer.classList.add('image-container');

                        // Tạo phần tử ảnh
                        const imgElement = document.createElement('img');
                        imgElement.src = imgDataUrl;
                        imgElement.alt = `Generated Image ${index + 1}`;
                        imgElement.classList.add('gallery-image'); // Thêm class để style và xác định ảnh gallery
                        // Thêm sự kiện click để mở popup
                        imgElement.onclick = () => openPopup(imgDataUrl, index);

                        // Tạo nút/link download
                        const downloadLink = document.createElement('a');
                        downloadLink.href = imgDataUrl;
                        // Đặt tên file download duy nhất (ví dụ: generated_image_1.png)
                        downloadLink.download = `generated_image_${index + 1}.png`;
                        downloadLink.textContent = 'Download';
                        downloadLink.classList.add('download-button'); // Thêm class để style

                        // Thêm ảnh và nút download vào container
                        imageContainer.appendChild(imgElement);
                        imageContainer.appendChild(downloadLink);

                        // Thêm container vào gallery
                        galleryDiv.appendChild(imageContainer);
                    });
                }

                if (allGeneratedTexts.length > 0) {
                    textSuccessCount = allGeneratedTexts.length;
                    console.log(allGeneratedTexts);
                
                    allGeneratedTexts.forEach(text => {
                        const textElement = document.createElement('div');
                        textElement.classList.add('generated-text');
                
                        // Chuyển đổi Markdown sang HTML
                        const htmlContent = marked.parse(text);
                        textElement.innerHTML = htmlContent; // Gán nội dung HTML đã parse
                
                        galleryDiv.appendChild(textElement);
                    });
                }

                // Cập nhật status tổng hợp
                let statusMessages = [];
                if (imageSuccessCount > 0) {
                    statusMessages.push(`Successfully generated ${imageSuccessCount} image(s)`);
                }
                if (textSuccessCount > 0) {
                    statusMessages.push(`Successfully generated ${textSuccessCount} text(s)`);
                }
                const failedMessage = failedRequests > 0 ? ` (${failedRequests} request(s) failed)` : '';
                setStatus(statusMessages.join('. ') + failedMessage, null); // Success status

            } else {
                // Handle case where all requests failed
                const firstError = results.find(r => r.status === 'rejected')?.reason?.message || 'Unknown error';
                setStatus(`All ${numRequests} generation requests failed. Last error: ${firstError}`, true);
            }

        } catch (error) {
            // This catch is less likely with Promise.allSettled unless there's a setup error
            console.error("Error processing API requests:", error);
            setStatus(`An unexpected error occurred: ${error.message}`, true);
        } finally {
            submitButton.disabled = false; // Re-enable button
        }
    });
    // Function to handle file drops
    function setupDragAndDrop(inputElementId) { // Thay đổi để nhận ID
        const fileInput = document.getElementById(inputElementId);
        if (!fileInput) {
            console.error(`Element with ID "${inputElementId}" not found.`);
            return;
        }
        const label = fileInput.previousElementSibling || fileInput.parentElement.querySelector('label[for="' + inputElementId + '"]');

        // Create a drop zone div that wraps the input if it doesn't exist
        let dropZone = fileInput.closest('.drop-zone'); // Kiểm tra xem drop-zone đã tồn tại chưa
        if (!dropZone) {
            dropZone = document.createElement('div');
            dropZone.className = 'drop-zone';
            dropZone.innerHTML = '<div class="drop-zone-prompt">Drag & drop image here or click to select</div>';
            fileInput.parentNode.insertBefore(dropZone, fileInput);
            dropZone.appendChild(fileInput); // Di chuyển input vào trong dropZone

            // Style the drop zone (chỉ style nếu mới tạo)
            dropZone.style.border = '2px dashed var(--secondary-color, #ccc)'; // Sử dụng biến CSS nếu có
            dropZone.style.borderRadius = 'var(--border-radius, 5px)';
            dropZone.style.padding = '20px';
            dropZone.style.textAlign = 'center';
            dropZone.style.cursor = 'pointer';
            dropZone.style.marginTop = '5px';
            dropZone.style.backgroundColor = 'var(--card-background, #f9f9f9)'; // Sử dụng biến CSS
            dropZone.style.position = 'relative'; // Cần thiết cho nút X và input ẩn
            dropZone.style.transition = 'background-color 0.2s ease, border-color 0.2s ease'; // Thêm transition
        }

        const promptElement = dropZone.querySelector('.drop-zone-prompt');

        // Highlight drop zone when dragging over
        dropZone.addEventListener('dragover', function(e) {
            e.preventDefault();
            e.stopPropagation();
            // Sử dụng class thay vì style trực tiếp để tương thích dark mode tốt hơn
            dropZone.classList.add('drag-over');
        });

        // Remove highlight when drag leaves
        dropZone.addEventListener('dragleave', function(e) {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.remove('drag-over');
        });

        // Handle the drop
        dropZone.addEventListener('drop', function(e) {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.remove('drag-over');

            if (e.dataTransfer.files.length) {
                fileInput.files = e.dataTransfer.files;
                updateThumbnail(dropZone, fileInput, fileInput.files[0]); // Truyền cả fileInput

                // Trigger change event
                const event = new Event('change', { bubbles: true });
                fileInput.dispatchEvent(event);
            }
        });

        // Handle selected files via click (Input vẫn hoạt động bình thường)
        fileInput.addEventListener('change', function() {
            if (fileInput.files.length) {
                updateThumbnail(dropZone, fileInput, fileInput.files[0]); // Truyền cả fileInput
            } else {
                // Nếu người dùng hủy chọn file, xóa thumbnail
                clearThumbnail(dropZone, fileInput);
            }
        });

        // Function to update thumbnail (moved outside setup but passed necessary elements)
        // It now accepts dropZone, fileInput, and the file
        function updateThumbnail(dropZone, fileInput, file) {
            clearThumbnail(dropZone, fileInput, false); // Xóa thumbnail cũ trước, không reset input

            const promptElement = dropZone.querySelector('.drop-zone-prompt');

            // Show thumbnail for image files
            if (file && file.type.startsWith('image/')) {
                const thumbnailElement = document.createElement('div');
                thumbnailElement.className = 'drop-zone-thumb';
                thumbnailElement.style.position = 'relative'; // Để định vị nút X
                thumbnailElement.style.width = '100%';
                thumbnailElement.style.height = 'auto'; // Chiều cao tự động
                thumbnailElement.style.minHeight = '100px'; // Chiều cao tối thiểu
                thumbnailElement.style.borderRadius = 'var(--border-radius, 5px)';
                thumbnailElement.style.overflow = 'hidden';
                thumbnailElement.style.marginTop = '10px';
                thumbnailElement.style.display = 'flex'; // Sử dụng flex để căn chỉnh tốt hơn
                thumbnailElement.style.flexDirection = 'column';
                thumbnailElement.style.alignItems = 'center';


                const img = document.createElement('img');
                img.src = URL.createObjectURL(file);
                img.style.maxWidth = '100%'; // Giới hạn chiều rộng tối đa
                img.style.maxHeight = '120px'; // Giới hạn chiều cao tối đa
                img.style.objectFit = 'contain'; // Hiển thị toàn bộ ảnh
                img.style.borderRadius = '3px'; // Bo góc nhẹ cho ảnh
                img.onload = () => URL.revokeObjectURL(img.src); // Giải phóng bộ nhớ khi ảnh tải xong
                thumbnailElement.appendChild(img);

                // Add file name
                const fileNameElement = document.createElement('div');
                fileNameElement.textContent = file.name;
                fileNameElement.style.fontSize = '12px'; // Nhỏ hơn một chút
                fileNameElement.style.marginTop = '8px';
                fileNameElement.style.color = 'var(--text-color, #333)';
                fileNameElement.style.wordBreak = 'break-all'; // Ngắt chữ nếu tên file quá dài
                thumbnailElement.appendChild(fileNameElement);

                // --- Thêm nút X ---
                const removeButton = document.createElement('button');
                removeButton.textContent = '×'; // Ký tự X (multiplication sign)
                removeButton.className = 'remove-image-btn';
                removeButton.setAttribute('aria-label', 'Remove image');
                removeButton.type = 'button'; // Quan trọng: không submit form
                removeButton.style.position = 'absolute';
                removeButton.style.top = '5px';
                removeButton.style.right = '5px';
                removeButton.style.background = 'rgba(0, 0, 0, 0.5)';
                removeButton.style.color = 'white';
                removeButton.style.border = 'none';
                removeButton.style.borderRadius = '50%';
                removeButton.style.width = '20px';
                removeButton.style.height = '20px';
                removeButton.style.fontSize = '18px'; // Có thể điều chỉnh cỡ chữ X nếu muốn
                removeButton.style.cursor = 'pointer';
                // removeButton.style.fontWeight = 'bold'; // Có thể bỏ nếu font mặc định đã đủ đậm
                removeButton.style.zIndex = '3'; // Đảm bảo nút nằm trên ảnh

                // --- Sử dụng Flexbox để căn giữa ---
                removeButton.style.display = 'flex';
                removeButton.style.alignItems = 'center';    // Căn giữa theo chiều dọc
                removeButton.style.justifyContent = 'center'; // Căn giữa theo chiều ngang

                // Thêm sự kiện click cho nút X
                removeButton.addEventListener('click', function(e) {
                    e.stopPropagation(); // Ngăn sự kiện click lan ra dropZone
                    clearThumbnail(dropZone, fileInput); // Gọi hàm xóa thumbnail và reset input
                });

                thumbnailElement.appendChild(removeButton);
                // --- Kết thúc thêm nút X ---

                dropZone.appendChild(thumbnailElement);

                // Hide the prompt text when there's a thumbnail
                if (promptElement) {
                    promptElement.style.display = 'none';
                }
            } else if (file) {
                    // Nếu là file khác không phải ảnh (có thể thêm xử lý ở đây)
                    if (promptElement) promptElement.style.display = 'block';
                    clearThumbnail(dropZone, fileInput); // Xóa nếu có thumbnail cũ
            } else {
                    // Trường hợp không có file (ví dụ khi gọi clearThumbnail)
                    if (promptElement) promptElement.style.display = 'block';
            }
        }

        // Function to clear the thumbnail and reset input (moved outside)
        function clearThumbnail(dropZone, fileInput, resetInput = true) {
            const thumbnailElement = dropZone.querySelector('.drop-zone-thumb');
            if (thumbnailElement) {
                // Clean up object URL if image exists
                const img = thumbnailElement.querySelector('img');
                if (img && img.src.startsWith('blob:')) {
                    URL.revokeObjectURL(img.src);
                }
                dropZone.removeChild(thumbnailElement);
            }

            // Show the prompt text again
            const promptElement = dropZone.querySelector('.drop-zone-prompt');
            if (promptElement) {
                promptElement.style.display = 'block';
            }

            // Reset the file input value
            if (resetInput) {
                fileInput.value = ''; // Cách chuẩn để reset input file
                    // Có thể cần trigger change event nếu logic khác phụ thuộc vào việc input rỗng
                    // const event = new Event('change', { bubbles: true });
                    // fileInput.dispatchEvent(event);
            }
        }

        // Initial check in case a file is already selected (e.g., back button)
        if (fileInput.files.length > 0) {
                updateThumbnail(dropZone, fileInput, fileInput.files[0]);
        }

    } // End setupDragAndDrop

    // Function to handle paste events
    function setupPasteCapture() {
        document.addEventListener('paste', function(e) {
            if (e.clipboardData && e.clipboardData.items) {
                const items = e.clipboardData.items;
                let imageFile = null;

                for (let i = 0; i < items.length; i++) {
                    if (items[i].type.indexOf('image') !== -1) {
                        imageFile = items[i].getAsFile();
                        break;
                    }
                }

                if (imageFile) {
                    e.preventDefault(); // Ngăn hành vi paste mặc định nếu tìm thấy ảnh
                    // Find which image input is focused or use the first empty one
                    let targetInput = null;
                    let targetDropZone = null;

                    const image1Input = document.getElementById('image1');
                    const image2Input = document.getElementById('image2');
                    const image1DropZone = image1Input ? image1Input.closest('.drop-zone') : null;
                    const image2DropZone = image2Input ? image2Input.closest('.drop-zone') : null;

                    const activeElementId = document.activeElement ? document.activeElement.id : null;

                    if (activeElementId === 'image1' || activeElementId === 'image2') {
                        targetInput = document.activeElement;
                        targetDropZone = targetInput.closest('.drop-zone');
                    } else if (image1Input && image1DropZone && !image1Input.files.length) {
                        targetInput = image1Input;
                        targetDropZone = image1DropZone;
                    } else if (image2Input && image2DropZone && !image2Input.files.length) {
                        targetInput = image2Input;
                        targetDropZone = image2DropZone;
                    } else if (image1Input && image1DropZone) {
                        // Cả hai đều có file hoặc image2 không tồn tại, dùng image1
                        targetInput = image1Input;
                        targetDropZone = image1DropZone;
                    } else if (image2Input && image2DropZone) {
                        // Chỉ image2 tồn tại và có file
                        targetInput = image2Input;
                        targetDropZone = image2DropZone;
                    }


                    if (targetInput && targetDropZone) {
                        // Create a new FileList-like object
                        const dataTransfer = new DataTransfer();
                        dataTransfer.items.add(imageFile);
                        targetInput.files = dataTransfer.files;

                        // Trigger change event to update the thumbnail
                        const event = new Event('change', { bubbles: true });
                        targetInput.dispatchEvent(event);

                        // Optional: Scroll to the updated input
                        targetDropZone.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    } else {
                            console.warn("Paste: Could not find a suitable target input for the image.");
                    }
                }
            }
        });

        // Add a notification to inform users about paste functionality
        const form = document.getElementById('generation-form');
        if(form && !document.querySelector('.paste-notice')) { // Kiểm tra form tồn tại và notice chưa có
            const pasteNotice = document.createElement('div');
            pasteNotice.className = 'paste-notice';
            pasteNotice.textContent = 'Tip: You can also paste images from clipboard (Ctrl+V/Cmd+V)';
            pasteNotice.style.fontSize = '14px';
            pasteNotice.style.color = 'var(--secondary-color, #666)'; // Dùng biến CSS
            pasteNotice.style.textAlign = 'center';
            pasteNotice.style.marginTop = '10px';
            pasteNotice.style.marginBottom = '15px';

            // Chèn vào trước element đầu tiên trong form hoặc cuối form nếu không có element nào
            const firstFormElement = form.firstElementChild;
            if (firstFormElement) {
                    form.insertBefore(pasteNotice, firstFormElement);
            } else {
                    form.appendChild(pasteNotice);
            }
        }
    }

    // Initialize drag and drop for both image inputs
    document.addEventListener('DOMContentLoaded', function() {
        setupDragAndDrop('image1');
        setupDragAndDrop('image2');
        setupPasteCapture();

        // Add some CSS for better styling and the remove button
        const style = document.createElement('style');
        style.textContent = `
            .form-group {
                margin-bottom: 20px;
            }

            /* Input file ẩn đi nhưng vẫn chiếm không gian và có thể focus */
            .drop-zone input[type=file] {
                position: absolute;
                left: 0;
                top: 0;
                height: 100%;
                width: 100%;
                opacity: 0;
                cursor: pointer;
                z-index: 2; /* Nằm trên prompt nhưng dưới nút X */
            }

            .form-group label {
                display: block;
                margin-bottom: 5px;
                font-weight: bold;
                color: var(--text-color); /* Thêm màu chữ từ biến CSS */
            }

            /* Style cho trạng thái kéo thả */
            .drop-zone.drag-over {
                    background-color: var(--primary-color-light, #e9e9e9) !important; /* !important để ghi đè inline style cũ nếu có */
                    border-color: var(--primary-color, #999) !important;
            }

                /* Style cho nút xóa */
            .remove-image-btn:hover {
                    background: rgba(255, 0, 0, 0.7) !important; /* Nổi bật hơn khi hover */
                    transform: scale(1.1); /* Phóng to nhẹ */
            }
            .remove-image-btn {
                    transition: background-color 0.2s ease, transform 0.2s ease;
            }

                /* CSS cho dark mode (nếu bạn có) */
                body.dark-mode .drop-zone {
                border-color: var(--secondary-color);
                background-color: var(--card-background);
                }
                body.dark-mode .drop-zone.drag-over {
                background-color: #4b5563 !important;
                border-color: #6b7280 !important;
                }
                body.dark-mode .remove-image-btn {
                    background: rgba(255, 255, 255, 0.3);
                    color: #ccc;
                }
                body.dark-mode .remove-image-btn:hover {
                    background: rgba(255, 50, 50, 0.7) !important;
                    color: white;
                }
                body.dark-mode .drop-zone-prompt {
                    color: var(--text-color); /* Màu chữ prompt trong dark mode */
                }
                body.dark-mode .paste-notice {
                    color: var(--secondary-color);
                }
        `;
        document.head.appendChild(style);
    });
    // Thêm biến CSS cho dark mode (Giữ nguyên phần này)
    document.head.insertAdjacentHTML('beforeend', `
    <style>
        :root {
            --primary-color: #4f46e5;
            --secondary-color: #d1d5db;
            --background-color: #f9fafb;
            --text-color: #1f2937;
            --card-background: #ffffff;
            --error-color: #ef4444;
            --success-color: #10b981;
            --border-radius: 8px; /* Giữ lại để dùng chung nếu muốn */
            --box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
        }

        body.dark-mode {
            --primary-color: #818cf8;
            --secondary-color: #4b5563;
            --background-color: #111827;
            --text-color: #e5e7eb;
            --card-background: #1f2937;
            --error-color: #f87171;
            --success-color: #34d399;
            --box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.5), 0 2px 4px -1px rgba(0, 0, 0, 0.3);
        }

        /* Стиль cho generated-text ở chế độ sáng */
        .generated-text {
            font-family: 'Arial', sans-serif;
            font-size: 16px;
            line-height: 1.5;
            color: var(--text-color); /* Sử dụng biến CSS cho màu chữ */
            margin-bottom: 15px;
            padding: 10px;
            background-color: var(--card-background); /* Sử dụng biến CSS cho màu nền card */
            border: 1px solid var(--secondary-color); /* Sử dụng biến CSS cho màu border */
            border-radius: 5px;
            white-space: pre-wrap; /* Giữ nguyên định dạng text */
        }

        /* Стиль cho generated-text ở chế độ tối */
        body.dark-mode .generated-text {
            color: var(--text-color); /* Sử dụng biến CSS cho màu chữ dark mode */
            background-color: var(--card-background); /* Sử dụng biến CSS cho màu nền card dark mode */
            border-color: var(--secondary-color); /* Sử dụng biến CSS cho màu border dark mode */
        }

        /* Giữ nguyên các style dark-mode khác */
        body.dark-mode .api-key-warning { background-color: #422006; color: #fbbf24; border-color: #92400e; }
        body.dark-mode #status.loading { background-color: #312e81; color: #c7d2fe; border: 1px solid #4338ca; }
        body.dark-mode #status.error { background-color: #7f1d1d; color: #fca5a5; border: 1px solid #b91c1c; }
        body.dark-mode #status.success { background-color: #064e3b; color: #6ee7b7; border: 1px solid #059669; }
        body.dark-mode input, body.dark-mode textarea, body.dark-mode select { background-color: #374151; color: #e5e7eb; border-color: #4b5563; }
        body.dark-mode input::placeholder, body.dark-mode textarea::placeholder { color: #9ca3af; }
        body.dark-mode .drop-zone { background-color: #374151 !important; border-color: #4b5563 !important; }
        body.dark-mode .drop-zone:hover, body.dark-mode .drop-zone.drag-over { background-color: #4b5563 !important; border-color: #6b7280 !important; }
        body.dark-mode footer, body.dark-mode .paste-notice { color: #9ca3af; }

        /* === CSS Nút Theme đã điều chỉnh === */
        .theme-toggle {
            position: absolute;
            top: 15px; /* Điều chỉnh vị trí nếu cần */
            right: 15px; /* Điều chỉnh vị trí nếu cần */
            background-color: var(--card-background);
            border: 1px solid var(--secondary-color);
            color: var(--text-color); /* Màu icon sẽ kế thừa từ đây */
            border-radius: 6px; /* Bo góc nhẹ */
            padding: 8px; /* Padding đều các cạnh */
            cursor: pointer;
            transition: all 0.3s ease;
            z-index: 1000;
            /* Kích thước cố định để chứa icon */
            width: 38px;
            height: 38px;
            /* Dùng grid để căn giữa icon */
            display: grid;
            place-items: center;
        }

        .theme-toggle:hover {
            background-color: var(--primary-color);
            color: white; /* Đảm bảo icon chuyển màu trắng khi hover */
            border-color: var(--primary-color);
        }

        .theme-toggle-icon {
            width: 20px; /* Kích thước icon */
            height: 20px;
            display: block; /* Đảm bảo icon là block element */
        }

        /* Điều chỉnh cho màn hình nhỏ */
        @media (max-width: 768px) {
            .theme-toggle {
                top: 10px;
                right: 10px;
                padding: 6px;
                width: 34px;
                height: 34px;
            }
            .theme-toggle-icon {
                width: 18px;
                height: 18px;
            }
        }

        /* --- Style cơ bản (Light Mode) cho Gallery và Popup --- */
        body.dark-mode .image-container {
            background-color: var(--card-background); /* Nền card tối */
            border-color: var(--secondary-color);     /* Viền tối hơn */
            box-shadow: var(--box-shadow);            /* Sử dụng bóng đổ của dark mode */
        }

        /* --- Nút Download nằm dưới mỗi ảnh trong gallery --- */
        body.dark-mode .download-button {
            background-color: var(--primary-color); /* Màu chính của dark mode */
            color: #ffffff; /* Giữ chữ trắng cho dễ đọc trên nền tối hơn */
            /* Tùy chọn: thêm viền nhẹ nếu muốn */
            /* border: 1px solid var(--primary-color); */
        }

        body.dark-mode .download-button:hover {
            /* Làm màu nền tối hơn/sáng hơn một chút để tạo hiệu ứng hover */
            /* Ví dụ: Giảm độ sáng của màu --primary-color */
            background-color: #6366f1; /* Hoặc một biến thể khác của --primary-color */
            /* border-color: #6366f1; */ /* Nếu có sử dụng border */
        }
        /* --- Nút Download bên trong Popup --- */
        body.dark-mode .popup-download-button {
            background-color: var(--success-color); /* Màu thành công của dark mode */
            color: var(--background-color); /* Dùng màu nền tối làm màu chữ để tương phản */
            /* Tùy chọn: thêm viền */
            /* border: 1px solid var(--success-color); */
        }

        body.dark-mode .popup-download-button:hover {
            /* Làm màu nền tối/sáng hơn một chút */
            background-color: #10b981; /* Hoặc một biến thể khác của --success-color */
            /* border-color: #10b981; */ /* Nếu có sử dụng border */
            /* color: #ffffff; */ /* Có thể đổi màu chữ nếu cần */
        }
    </style>
    `);

    // Hàm tạo nút chuyển đổi theme
    function createThemeToggle() {
        // Tạo nút toggle
        const themeToggle = document.createElement('button');
        themeToggle.className = 'theme-toggle';
        // Cập nhật aria-label cho rõ ràng hơn
        themeToggle.setAttribute('aria-label', 'Chuyển đổi giao diện Sáng/Tối');

        // Đặt icon ban đầu (Moon) - KHÔNG CÓ TEXT
        themeToggle.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" class="theme-toggle-icon moon" viewBox="0 0 20 20" fill="currentColor">
                <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
            </svg>
        `;

        // Thêm nút vào body (hoặc container phù hợp)
        document.body.appendChild(themeToggle);

        // Kiểm tra preference được lưu trữ
        const savedTheme = localStorage.getItem('theme');
        const isInitiallyDarkMode = savedTheme === 'dark';

        if (isInitiallyDarkMode) {
            document.body.classList.add('dark-mode');
        }
        // Cập nhật icon nút dựa trên theme ban đầu (dù là light hay dark)
        updateToggleButtonIcon(isInitiallyDarkMode);


        // Thêm sự kiện click
        themeToggle.addEventListener('click', function() {
            const isDarkMode = document.body.classList.toggle('dark-mode');
            updateToggleButtonIcon(isDarkMode); // Chỉ cập nhật icon
            localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
        });

        // Hàm cập nhật chỉ icon của nút
        function updateToggleButtonIcon(isDarkMode) {
            if (isDarkMode) {
                // Chuyển sang icon Sun - KHÔNG CÓ TEXT
                themeToggle.innerHTML = `
                    <svg xmlns="http://www.w3.org/2000/svg" class="theme-toggle-icon sun" viewBox="0 0 20 20" fill="currentColor">
                        <path fill-rule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clip-rule="evenodd" />
                    </svg>
                `;
            } else {
                // Chuyển sang icon Moon - KHÔNG CÓ TEXT
                themeToggle.innerHTML = `
                    <svg xmlns="http://www.w3.org/2000/svg" class="theme-toggle-icon moon" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
                    </svg>
                `;
            }
        }
    }

    // Khởi tạo nút khi DOM đã tải xong
    document.addEventListener('DOMContentLoaded', function() {
        createThemeToggle(); // Gọi hàm tạo nút

        // Phát hiện chế độ ưa thích của hệ thống (nếu chưa có lưu trữ local)
        if (!localStorage.getItem('theme')) {
            if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
                document.body.classList.add('dark-mode');
                localStorage.setItem('theme', 'dark');

                // Cập nhật lại icon của nút nếu theme hệ thống là dark
                const themeToggle = document.querySelector('.theme-toggle');
                if (themeToggle) {
                    // Chỉ cập nhật icon Sun - KHÔNG CÓ TEXT
                    themeToggle.innerHTML = `
                        <svg xmlns="http://www.w3.org/2000/svg" class="theme-toggle-icon sun" viewBox="0 0 20 20" fill="currentColor">
                            <path fill-rule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clip-rule="evenodd" />
                        </svg>
                    `;
                }
            }
        }
    });
});