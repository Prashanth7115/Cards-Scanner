import React, { useState, useEffect, useRef } from "react";
import { 
  Camera, 
  Upload, 
  Download, 
  Copy, 
  Check, 
  Trash2, 
  RefreshCw, 
  Plus, 
  Link, 
  AlertTriangle, 
  CheckCircle, 
  Eye, 
  Share2, 
  FileSpreadsheet, 
  LogOut, 
  ChevronRight, 
  Smartphone, 
  Mail, 
  MapPin, 
  Briefcase, 
  Building, 
  Globe, 
  ArrowRight,
  Info,
  X
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { initAuth, googleSignIn, logout, getAccessToken, isFirebasePlaceholder } from "./firebase";
import { createGoogleSheet, appendGoogleSheet, extractSpreadsheetId } from "./sheets";
import { ScanRecord, ScannedData } from "./types";

// Resilient memory-backed cache for sandboxed iframes preventing SecurityError on localStorage
const memoryStorage: Record<string, string> = {};
const safeStorage = {
  getItem: (key: string): string | null => {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        return window.localStorage.getItem(key);
      }
    } catch (e) {
      console.warn("Storage access rejected, falling back to memory:", e);
    }
    return memoryStorage[key] || null;
  },
  setItem: (key: string, value: string): void => {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem(key, value);
        return;
      }
    } catch (e) {
      console.warn("Storage write rejected, falling back to memory:", e);
    }
    memoryStorage[key] = value;
  }
};

export default function App() {
  // Auth state
  const [user, setUser] = useState<any>(null);
  const [token, setToken] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [showAuthSetupModal, setShowAuthSetupModal] = useState(false);

  // Scanning images state
  const [frontImage, setFrontImage] = useState<string | null>(null);
  const [backImage, setBackImage] = useState<string | null>(null);
  const [activeSide, setActiveSide] = useState<"front" | "back">("front");

  // Camera stream state
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [activeStream, setActiveStream] = useState<MediaStream | null>(null);

  // Extraction / Scanning states
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ScannedData | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [activeRecordId, setActiveRecordId] = useState<string | null>(null);
  const [skipBacksidePrompt, setSkipBacksidePrompt] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error" | "info"; msg: string } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm: () => void | Promise<void>;
  } | null>(null);
  
  const triggerToast = (msg: string, type: "success" | "error" | "info" = "success") => {
    setToast({ msg, type });
  };

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        setToast(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  
  // Scans database (Local Queue)
  const [records, setRecords] = useState<ScanRecord[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRecord, setSelectedRecord] = useState<ScanRecord | null>(null);

  // Scanned Card Archive checkmarks state
  const [selectedRecordIds, setSelectedRecordIds] = useState<string[]>([]);

  // Glacier Export Setup Wizard (Pop-up) states
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportFilename, setExportFilename] = useState("InstaScan_Contacts_Export");
  const [exportDateRange, setExportDateRange] = useState<"all" | "selected" | "past24h" | "past7d" | "past30d">("all");
  const [exportMethod, setExportMethod] = useState<"new" | "append">("new");
  const [appendFile, setAppendFile] = useState<File | null>(null);
  const [appendStatus, setAppendStatus] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [parsingCSV, setParsingCSV] = useState(false);
  const [existingCSVRecordsCount, setExistingCSVRecordsCount] = useState<number | null>(null);
  const [rawExistingCSVText, setRawExistingCSVText] = useState<string>("");

  // Google Sheets state
  const [sheetsActionType, setSheetsActionType] = useState<"create" | "existing">("create");
  const [existingSheetUrl, setExistingSheetUrl] = useState("");
  const [sheetsMessage, setSheetsMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isSyncingSheets, setIsSyncingSheets] = useState(false);

  // Copy badges
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [isCopiedText, setIsCopiedText] = useState(false);

  // Initializing Firebase Auth
  useEffect(() => {
    const unsubscribe = initAuth(
      (currentUser, currentToken) => {
        setUser(currentUser);
        setToken(currentToken);
        setNeedsAuth(false);
      },
      () => {
        setUser(null);
        setToken(null);
        setNeedsAuth(true);
      }
    );
    return () => unsubscribe();
  }, []);

  // Hydrate local records history
  useEffect(() => {
    const saved = safeStorage.getItem("instascan_records");
    if (saved) {
      try {
        setRecords(JSON.parse(saved));
      } catch (err) {
        console.error("Failed to load local scans:", err);
      }
    }
  }, []);

  // Sync to database
  const saveRecordsToLocal = (newRecords: ScanRecord[]) => {
    setRecords(newRecords);
    safeStorage.setItem("instascan_records", JSON.stringify(newRecords));
  };

  // Handle Sign-in
  const handleGoogleLogin = async () => {
    if (isFirebasePlaceholder) {
      setShowAuthSetupModal(true);
      return;
    }
    setIsLoggingIn(true);
    try {
      const resp = await googleSignIn();
      if (resp) {
        setUser(resp.user);
        setToken(resp.accessToken);
        setNeedsAuth(false);
      }
    } catch (err: any) {
      console.error("Sign in failed:", err);
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Handle Logout
  const handleGoogleLogout = () => {
    setConfirmDialog({
      title: "Sign Out",
      message: "Are you sure you want to sign out from Google Sheets synchronization?",
      confirmText: "Sign Out",
      onConfirm: async () => {
        try {
          await logout();
          setUser(null);
          setToken(null);
          setNeedsAuth(true);
          setSheetsMessage(null);
          triggerToast("Successfully signed out.", "info");
        } catch (err) {
          console.error("Logout failed:", err);
          triggerToast("Failed to sign out.", "error");
        }
      }
    });
  };

  // WebRTC Live camera activation
  const startCamera = async (side: "front" | "back") => {
    setActiveSide(side);
    setIsCameraActive(true);
    setScanError(null);
    try {
      if (activeStream) {
        activeStream.getTracks().forEach(track => track.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facingMode, width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      setActiveStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Camera access failed", err);
      setIsCameraActive(false);
    }
  };

  // Lens cycle (front vs rear camera)
  const toggleCameraFacing = async () => {
    const nextFacing = facingMode === "environment" ? "user" : "environment";
    setFacingMode(nextFacing);
    if (isCameraActive) {
      try {
        if (activeStream) {
          activeStream.getTracks().forEach(track => track.stop());
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: nextFacing, width: { ideal: 1280 }, height: { ideal: 720 } }
        });
        setActiveStream(stream);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error("Failed to switch camera lens", err);
      }
    }
  };

  // Close / stop camera feed
  const stopCamera = () => {
    if (activeStream) {
      activeStream.getTracks().forEach(track => track.stop());
      setActiveStream(null);
    }
    setIsCameraActive(false);
  };

  // Capture current camera viewfinder frame
  const captureImage = () => {
    if (videoRef.current) {
      const video = videoRef.current;
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 960;
      canvas.height = video.videoHeight || 540;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const base64Data = canvas.toDataURL("image/jpeg", 0.9);
        if (activeSide === "front") {
          setFrontImage(base64Data);
          setSkipBacksidePrompt(false);
        } else {
          setBackImage(base64Data);
        }
      }
      stopCamera();
    }
  };

  // Handle local file uploads (Media Gallery fallback)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, side: "front" | "back") => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === "string") {
          if (side === "front") {
            setFrontImage(reader.result);
            setSkipBacksidePrompt(false);
          } else {
            setBackImage(reader.result);
          }
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Clear single image slot
  const clearImage = (side: "front" | "back") => {
    if (side === "front") {
      setFrontImage(null);
    } else {
      setBackImage(null);
    }
    setScanResult(null);
    setScanError(null);
  };

  // Initiate AI scan and parsing via server endpoint
  const handleAIScan = async () => {
    if (!frontImage) return;

    setIsScanning(true);
    setScanError(null);
    setScanResult(null);
    setActiveRecordId(null);

    try {
      const response = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          frontImage,
          backImage: backImage || undefined
        })
      });

      if (!response.ok) {
        throw new Error("Scanning server error. Please try again.");
      }

      const result: ScannedData = await response.json();

      if (!result.readable) {
        setScanError("Image not clear, unable to read data on it. Please capture/upload again clear.");
        triggerToast("Image not clear, unable to extract details. Please try again with a better photo.", "error");
      } else {
        setScanResult(result);
        
        // Auto-save contact record directly upon successful vision analysis
        const timestamp = new Date().toLocaleString("en-US", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: true
        });

        const newId = typeof crypto !== "undefined" && crypto.randomUUID 
          ? crypto.randomUUID() 
          : Math.random().toString(36).substring(2, 15) + Date.now().toString(36);

        const newRecord: ScanRecord = {
          id: newId,
          frontImage: frontImage!,
          backImage: backImage || undefined,
          data: { ...result },
          timestamp,
          createdAt: Date.now()
        };

        // Merge directly with current records
        saveRecordsToLocal([newRecord, ...records]);
        setActiveRecordId(newId);
        triggerToast(`Card for "${result.name}" auto-saved to your archive!`, "success");
      }
    } catch (err: any) {
      console.error(err);
      setScanError(err.message || "Something went wrong while contacting scanner AI.");
      triggerToast("Scanning failed due to a system network error.", "error");
    } finally {
      setIsScanning(false);
    }
  };

  // Reset/Clear scanning input queue
  const resetScanEngine = () => {
    setFrontImage(null);
    setBackImage(null);
    setScanResult(null);
    setActiveRecordId(null);
    setSkipBacksidePrompt(false);
  };

  // Direct editing in the structured display boxes with automated on-the-fly saves
  const handleFieldChange = (field: keyof ScannedData, val: string) => {
    if (scanResult) {
      const updatedData = {
        ...scanResult,
        [field]: val
      };
      setScanResult(updatedData);

      // Instantly synchronize change into the auto-saved record inside archive
      if (activeRecordId) {
        const updatedRecords = records.map(rec => {
          if (rec.id === activeRecordId) {
            return {
              ...rec,
              data: updatedData
            };
          }
          return rec;
        });
        saveRecordsToLocal(updatedRecords);
      }
    }
  };

  // Delete a scanned contact
  const handleDeleteRecord = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setConfirmDialog({
      title: "Delete Contact",
      message: "Are you sure you want to permanently delete this contact record?",
      confirmText: "Delete",
      onConfirm: () => {
        const filtered = records.filter(item => item.id !== id);
        saveRecordsToLocal(filtered);
        if (selectedRecord?.id === id) {
          setSelectedRecord(null);
        }
        triggerToast("Contact record deleted.", "info");
      }
    });
  };

  // Safe clipboard copy handler with robust modern & legacy fallbacks
  const safeCopyToClipboard = (text: string): Promise<boolean> => {
    return new Promise((resolve) => {
      try {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
          navigator.clipboard.writeText(text)
            .then(() => resolve(true))
            .catch((err) => {
              console.warn("Modern clipboard write failed, trying fallback:", err);
              resolve(fallbackCopyText(text));
            });
        } else {
          resolve(fallbackCopyText(text));
        }
      } catch (err) {
        console.warn("Clipboard API operation rejected:", err);
        resolve(fallbackCopyText(text));
      }
    });
  };

  const fallbackCopyText = (text: string): boolean => {
    try {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "fixed";
      textArea.style.top = "0";
      textArea.style.left = "0";
      textArea.style.opacity = "0";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const successful = document.execCommand("copy");
      document.body.removeChild(textArea);
      return successful;
    } catch (err) {
      console.error("Textarea fallback copying failed too:", err);
      return false;
    }
  };

  // Single field copy action helper
  const copyToClipboard = async (text: string, identifier: string) => {
    const success = await safeCopyToClipboard(text);
    if (success) {
      setCopiedField(identifier);
      setTimeout(() => setCopiedField(null), 1800);
    }
  };

  // Pre-formatted plain text copy template
  const copyRecordText = async (record: ScanRecord) => {
    const formatted = `--- InstaScan AI Contact ---
Name: ${record.data.name}
Role/Designation: ${record.data.designation}
Company: ${record.data.company}
Mobile: ${record.data.mobile}
Email: ${record.data.email}
Address: ${record.data.address}
Website: ${record.data.website}
Scan Date: ${record.timestamp}`;

    const success = await safeCopyToClipboard(formatted);
    if (success) {
      setIsCopiedText(true);
      setTimeout(() => setIsCopiedText(false), 1800);
    }
  };

  // Helper to parse existing uploaded offline CSV completely on-the-fly
  const parseCSV = (text: string): string[][] => {
    const lines: string[][] = [];
    let row: string[] = [];
    let col = "";
    let insideQuote = false;

    for (let i = 0; i < text.length; i++) {
       const char = text[i];
       const nextChar = text[i + 1];

       if (char === '"') {
         if (insideQuote && nextChar === '"') {
           col += '"';
           i++; // Skip extra quote
         } else {
           insideQuote = !insideQuote;
         }
       } else if (char === ',' && !insideQuote) {
         row.push(col);
         col = "";
       } else if ((char === '\r' || char === '\n') && !insideQuote) {
         if (char === '\r' && nextChar === '\n') {
           i++;
         }
         row.push(col);
         lines.push(row);
         row = [];
         col = "";
       } else {
         col += char;
       }
    }
    if (col || row.length > 0) {
      row.push(col);
      lines.push(row);
    }
    return lines.filter(r => r.some(cell => cell.trim() !== ""));
  };

  // Open multi-select and timeline based Glacier export wizard
  const openExportWizard = (range: "all" | "selected") => {
    if (records.length === 0) {
      alert("No contacts logged in local archive to export.");
      return;
    }
    setExportDateRange(range);
    setExportFilename(`InstaScan_Contacts_Export_${new Date().toISOString().slice(0, 10).replace(/-/g, "_")}`);
    setExportMethod("new");
    setAppendFile(null);
    setAppendStatus(null);
    setExistingCSVRecordsCount(null);
    setRawExistingCSVText("");
    setIsExportModalOpen(true);
  };

  // Process appended file upload
  const handleFileToAppendChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files ? e.target.files[0] : null;
    if (!file) return;

    setAppendFile(file);
    setParsingCSV(true);
    setAppendStatus(null);
    setExistingCSVRecordsCount(null);
    setRawExistingCSVText("");

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        if (!text) {
          throw new Error("File content could not be read.");
        }
        const rows = parseCSV(text);
        if (rows.length === 0) {
          throw new Error("The selected CSV file appears to be empty.");
        }

        setRawExistingCSVText(text);

        // Deduce if has standard header row
        const headerRow = rows[0] || [];
        const isStandardHeader = headerRow.some(col => 
          col.toLowerCase().includes("designation") || 
          col.toLowerCase().includes("scan date") ||
          col.toLowerCase().includes("company")
        );

        const dataRowsCount = isStandardHeader ? rows.length - 1 : rows.length;
        setExistingCSVRecordsCount(dataRowsCount);
        setAppendStatus({
          type: "success",
          msg: `Valid CSV file linked. Loaded ${dataRowsCount} contacts from disk.`
        });
      } catch (err: any) {
        console.error(err);
        setAppendStatus({
          type: "error",
          msg: err.message || "Failed to parse CSV. Make sure you chose a generic .csv file."
        });
        setAppendFile(null);
      } finally {
        setParsingCSV(false);
      }
    };
    reader.onerror = () => {
      setAppendStatus({ type: "error", msg: "Failed reading selected file." });
      setParsingCSV(false);
      setAppendFile(null);
    };
    reader.readAsText(file);
  };

  // Delete all selected checkmarks records
  const handleDeleteSelectedRecords = () => {
    if (selectedRecordIds.length === 0) return;
    setConfirmDialog({
      title: "Delete Selected",
      message: `Permanently delete the ${selectedRecordIds.length} checked contacts from local storage?`,
      confirmText: "Delete Selected",
      onConfirm: () => {
        const remaining = records.filter(rec => !selectedRecordIds.includes(rec.id));
        saveRecordsToLocal(remaining);
        setSelectedRecordIds([]);
        triggerToast("Selected records deleted.", "info");
      }
    });
  };

  // Perform full filtered and timeline-based export
  const executeCSVExport = () => {
    // 1. Determine base set of records
    let baseRecords = [...records];

    if (exportDateRange === "selected") {
      baseRecords = records.filter(r => selectedRecordIds.includes(r.id));
    } else if (exportDateRange === "past24h") {
      const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
      baseRecords = records.filter(r => {
        const time = r.createdAt || Date.parse(r.timestamp) || Date.now();
        return time >= dayAgo;
      });
    } else if (exportDateRange === "past7d") {
      const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      baseRecords = records.filter(r => {
        const time = r.createdAt || Date.parse(r.timestamp) || Date.now();
        return time >= weekAgo;
      });
    } else if (exportDateRange === "past30d") {
      const monthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
      baseRecords = records.filter(r => {
        const time = r.createdAt || Date.parse(r.timestamp) || Date.now();
        return time >= monthAgo;
      });
    }

    if (baseRecords.length === 0) {
      alert("No matching contacts found in the specified timeline filter.");
      return;
    }

    let csvContent = "";
    let nextSerialNum = 1;

    if (exportMethod === "append") {
      if (!rawExistingCSVText) {
        alert("Please load an existing base CSV file from your disk first.");
        return;
      }
      csvContent = rawExistingCSVText;
      if (!csvContent.endsWith("\n")) {
        csvContent += "\n";
      }
      if (existingCSVRecordsCount !== null) {
        nextSerialNum = existingCSVRecordsCount + 1;
      } else {
        const rows = parseCSV(rawExistingCSVText);
        nextSerialNum = rows.length > 0 ? rows.length : 1;
      }
    } else {
      // Create New
      csvContent = "\uFEFF"; // UTF-8 BOM compatibility
      csvContent += "S.No,Name,Designation / Title,Mobile Number,Company Name,Full Address,Email,Website,Scan Date & Time\n";
    }

    // Process new rows
    baseRecords.forEach((record, idx) => {
      const serial = nextSerialNum + idx;
      const clean = (val: string) => {
        const str = val ? val.replace(/"/g, '""') : "";
        return `"${str}"`;
      };

      csvContent += [
        serial,
        clean(record.data.name),
        clean(record.data.designation),
        clean(record.data.mobile),
        clean(record.data.company),
        clean(record.data.address),
        clean(record.data.email),
        clean(record.data.website),
        clean(record.timestamp)
      ].join(",") + "\n";
    });

    // Download file
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    const cleanFilename = exportFilename.trim().replace(/\.csv$/i, "");
    link.setAttribute("download", `${cleanFilename || "InstaScan_Contacts"}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    // Close wizard and optional cleanups
    setIsExportModalOpen(false);
    setSelectedRecordIds([]); // clear selection upon successful export
  };

  const handleExportCSV = () => {
    openExportWizard("all");
  };

  // Export & Synchronize to Google Sheets
  const handleSheetsExport = async () => {
    if (records.length === 0) {
      setSheetsMessage({ type: "error", text: "No scanned contact data to export." });
      return;
    }

    const activeToken = getAccessToken();
    if (!activeToken) {
      setSheetsMessage({ type: "error", text: "Google authorization token is missing or expired. Please sign in with Google again." });
      setNeedsAuth(true);
      return;
    }

    setIsSyncingSheets(true);
    setSheetsMessage(null);

    try {
      let targetId = "";
      let isNew = false;

      if (sheetsActionType === "create") {
        const titleStr = `InstaScan AI Cards Archive (${new Date().toLocaleDateString()})`;
        const res = await createGoogleSheet(activeToken, titleStr);
        targetId = res.spreadsheetId;
        isNew = true;
      } else {
        if (!existingSheetUrl) {
          throw new Error("Please specify the Google Sheet URL or spreadsheet ID.");
        }
        targetId = extractSpreadsheetId(existingSheetUrl);
      }

      // Convert scanned contacts database matching Excel / Column standards
      const rows = records.map((record, index) => [
        index + 1,
        record.data.name,
        record.data.designation,
        record.data.mobile,
        record.data.company,
        record.data.address,
        record.data.email,
        record.data.website,
        record.timestamp
      ]);

      await appendGoogleSheet(activeToken, targetId, rows);

      setSheetsMessage({
        type: "success",
        text: isNew 
          ? `Successfully created a new template and synced ${records.length} records!`
          : `Successfully appended ${records.length} records to your sheet!`
      });

      if (isNew) {
        setExistingSheetUrl(`https://docs.google.com/spreadsheets/d/${targetId}`);
        setSheetsActionType("existing");
      }
    } catch (err: any) {
      console.error(err);
      setSheetsMessage({ type: "error", text: err.message || "Failed to synchronize to Google Sheets." });
    } finally {
      setIsSyncingSheets(false);
    }
  };

  // Search filtered records
  const filteredRecords = records.filter(item => {
    const term = searchTerm.toLowerCase();
    return (
      item.data.name.toLowerCase().includes(term) ||
      item.data.company.toLowerCase().includes(term) ||
      item.data.mobile.toLowerCase().includes(term) ||
      item.data.designation.toLowerCase().includes(term)
    );
  });

  return (
    <div id="instascan-main-app" className="min-h-screen bg-gradient-to-b from-[#020617] via-[#030d22] to-[#010309] text-slate-200 flex flex-col font-sans selection:bg-cyan-500 selection:text-slate-900 overflow-x-hidden relative">
      {/* Immersive radial grid dot pattern background */}
      <div className="absolute inset-0 opacity-[0.07] pointer-events-none" style={{ backgroundImage: "radial-gradient(#22d3ee 0.6px, transparent 0.6px)", backgroundSize: "32px 32px" }} />

      {/* Primary Header Navbar */}
      <header className="sticky top-0 z-40 bg-[#020617]/85 backdrop-blur-md border-b border-white/5 px-6 py-4.5 transition-all">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-3 group cursor-pointer select-none">
              <div className="relative w-10 h-10 flex items-center justify-center shrink-0">
                {/* Glow backplates */}
                <span className="absolute inset-0 bg-cyan-500/10 rounded-xl blur-md group-hover:bg-cyan-400/20 transition-all duration-500" />
                
                {/* Physical frosted body */}
                <div className="absolute inset-0 bg-gradient-to-br from-[#0d1c36] via-[#081226] to-[#02050d] rounded-xl border border-white/10 group-hover:border-cyan-400/40 shadow-lg flex items-center justify-center overflow-hidden transition-all duration-300">
                  {/* Subtle sweep line in logo */}
                  <span className="absolute inset-x-0 h-[1.5px] bg-cyan-400 opacity-60 shadow-[0_0_8px_rgba(34,211,238,0.8)] group-hover:animate-bounce top-1" />
                  
                  {/* Premium inline glacier/prism SVG icon */}
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-cyan-400 group-hover:scale-110 group-hover:rotate-6 transition-all duration-500">
                    <path d="M12 2L2 7l10 5 10-5-10-5z" />
                    <path d="M2 17l10 5 10-5" />
                    <path d="M2 12l10 5 10-5" />
                  </svg>
                </div>
              </div>
              <div>
                <h1 className="text-lg font-black tracking-wider text-white font-display flex items-center gap-1 leading-none">
                  InstaScan <span className="text-cyan-400 drop-shadow-[0_0_6px_rgba(34,211,238,0.4)]">AI</span>
                </h1>
                <p className="text-[9px] text-[#475569] font-mono tracking-widest leading-none mt-1 uppercase font-black">Glacier Business Vision</p>
              </div>
            </div>
          </div>

          {/* System Ready & Google Workspace Sync */}
          <div className="flex items-center gap-4 sm:gap-6 shrink-0">
            <div className="flex items-center gap-2 text-[10px] uppercase font-bold tracking-widest text-[#22d3ee] bg-cyan-950/20 px-2.5 py-1 rounded border border-cyan-500/10">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping"></span>
              SYSTEM READY
            </div>
            
            <div className="flex items-center gap-3">
              {user ? (
                <div className="flex items-center gap-2 bg-white/5 pl-2 pr-3 py-1.5 rounded-full border border-white/5 text-xs text-slate-300 hover:border-white/10 transition-colors">
                  {user.photoURL ? (
                    <img src={user.photoURL} alt="Avatar" className="w-5 h-5 rounded-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-cyan-600 flex items-center justify-center font-bold text-[9px] text-white">
                      {user.displayName?.charAt(0) || "U"}
                    </div>
                  )}
                  <span className="hidden md:inline font-medium max-w-[110px] truncate">{user.displayName || user.email}</span>
                  <button 
                    onClick={handleGoogleLogout} 
                    title="Disconnect Google Auth" 
                    className="text-slate-400 hover:text-red-400 p-0.5 transition-colors ml-1"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleGoogleLogin}
                  disabled={isLoggingIn}
                  className="px-3.5 py-1.5 border border-white/10 hover:border-cyan-500/40 hover:text-cyan-400 rounded-full text-[11px] hover:bg-white/5 transition-all uppercase tracking-widest font-bold text-slate-300 flex items-center gap-2"
                >
                  {isLoggingIn ? (
                    <RefreshCw className="w-3 h-3 animate-spin text-cyan-400" />
                  ) : (
                    <div className="w-3 h-3 flex items-center justify-center shrink-0">
                      <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="w-2.5 h-2.5">
                        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                      </svg>
                    </div>
                  )}
                  <span>Sign In</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Core Content Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 lg:py-8 grid grid-cols-1 lg:grid-cols-12 gap-8 relative z-10">
        
        {/* Left Hand Capture Form & Laser Suite */}
        <section className="lg:col-span-7 space-y-6">
          <div className="bg-[#0a0a0a] border border-white/10 rounded-2xl p-6 shadow-xl relative overflow-hidden">
            <div className="absolute inset-0 opacity-15 pointer-events-none" style={{ backgroundImage: "radial-gradient(#10b981 0.5px, transparent 0.5px)", backgroundSize: "24px 24px" }} />
            
            {/* Step Selector & Details Banner */}
            <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-5 relative z-10">
              <h2 className="text-xs uppercase tracking-[0.2em] text-slate-400 font-bold flex items-center gap-2">
                <span className="flex items-center justify-center w-5 h-5 rounded bg-emerald-500 text-black text-xs font-bold">1</span>
                Image Capture Setup
              </h2>
              <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">DUAL SIDE EXTRACT</span>
            </div>

            {/* Front & Back Selector Slots */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              
              {/* Front side Slot */}
              <div className={`p-4 rounded-xl border ${activeSide === "front" ? "border-emerald-500/50 bg-[#080808]" : "border-white/5 bg-[#080808]/80 opacity-80"} transition-all flex flex-col justify-between relative z-10`}>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                    Front Side <span className="text-emerald-500 text-[9px] font-bold bg-emerald-500/10 px-1.5 py-0.5 rounded">REQUIRED</span>
                  </span>
                  {frontImage && (
                    <button onClick={() => clearImage("front")} className="p-1 text-slate-500 hover:text-red-400 transition-colors" title="Remove Front Image">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {frontImage ? (
                  <div className="relative aspect-[1.58/1] rounded-lg bg-black border border-white/10 overflow-hidden flex items-center justify-center group shadow-md">
                    <img src={frontImage} alt="Front Card Snapshot" className="w-full h-full object-cover transition-transform group-hover:scale-105 duration-300" />
                    <div className="absolute inset-x-0 bottom-0 bg-black/80 px-3 py-2 flex items-center justify-between text-[10px] border-t border-white/10">
                      <span className="text-emerald-450 font-bold tracking-wider uppercase">READY</span>
                      <button onClick={() => startCamera("front")} className="text-slate-300 hover:text-emerald-400 font-bold uppercase tracking-widest text-[9px]">Re-take</button>
                    </div>
                  </div>
                ) : (
                  <div className="aspect-[1.58/1] rounded-lg bg-white/2 border border-dashed border-white/10 flex flex-col items-center justify-center p-4 gap-3 text-center text-xs hover:border-emerald-500/40 transition-colors">
                    <Smartphone className="w-5 h-5 text-slate-500" />
                    <span className="text-slate-400 font-medium text-[11px]">Primary front layout snapshot</span>
                    <div className="flex items-center gap-2 mt-1">
                      <button 
                        onClick={() => startCamera("front")} 
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-black font-extrabold uppercase rounded text-[9px] tracking-widest transition-all animate-pulse"
                      >
                        Launch Camera
                      </button>
                      <label className="px-3 py-1.5 bg-white/5 border border-white/15 text-slate-300 hover:bg-white/10 cursor-pointer rounded font-extrabold uppercase text-[9px] tracking-widest transition-all">
                        Upload
                        <input type="file" accept="image/*" onChange={(e) => handleFileUpload(e, "front")} className="hidden" />
                      </label>
                    </div>
                  </div>
                )}
              </div>

              {/* Back side Slot (Optional) */}
              <div className={`p-4 rounded-xl border ${activeSide === "back" ? "border-emerald-500/50 bg-[#080808]" : "border-white/5 bg-[#080808]/80 opacity-80"} transition-all flex flex-col justify-between relative z-10`}>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                    Back Side <span className="text-slate-500 text-[9px] font-bold bg-white/5 px-1.5 py-0.5 rounded">OPTIONAL</span>
                  </span>
                  {backImage && (
                    <button onClick={() => clearImage("back")} className="p-1 text-slate-500 hover:text-red-400 transition-colors" title="Remove Back Image">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {backImage ? (
                  <div className="relative aspect-[1.58/1] rounded-lg bg-black border border-white/10 overflow-hidden flex items-center justify-center group shadow-md">
                    <img src={backImage} alt="Back Card Snapshot" className="w-full h-full object-cover transition-transform group-hover:scale-105 duration-300" />
                    <div className="absolute inset-x-0 bottom-0 bg-black/80 px-3 py-2 flex items-center justify-between text-[10px] border-t border-white/10">
                      <span className="text-emerald-450 font-bold tracking-wider uppercase">READY</span>
                      <button onClick={() => startCamera("back")} className="text-slate-300 hover:text-emerald-400 font-bold uppercase tracking-widest text-[9px]">Re-take</button>
                    </div>
                  </div>
                ) : (
                  <div className="aspect-[1.58/1] rounded-lg bg-white/2 border border-dashed border-white/10 flex flex-col items-center justify-center p-4 gap-3 text-center text-xs hover:border-emerald-500/40 transition-colors">
                    <Smartphone className="w-5 h-5 text-slate-500" />
                    <span className="text-slate-400 font-medium text-[11px]">Secondary back details model</span>
                    <div className="flex items-center gap-2 mt-1">
                      <button 
                        onClick={() => startCamera("back")} 
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-black font-extrabold uppercase rounded text-[9px] tracking-widest transition-all"
                      >
                        Launch Camera
                      </button>
                      <label className="px-3 py-1.5 bg-white/5 border border-white/15 text-slate-300 hover:bg-white/10 cursor-pointer rounded font-extrabold uppercase text-[9px] tracking-widest transition-all">
                        Upload
                        <input type="file" accept="image/*" onChange={(e) => handleFileUpload(e, "back")} className="hidden" />
                      </label>
                    </div>
                  </div>
                )}
              </div>

            </div>

            {/* Recommended Action Banner (Dynamic prompts) */}
            {frontImage && !backImage && !skipBacksidePrompt && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-4 p-4 bg-emerald-950/10 border border-emerald-500/20 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-3 text-xs relative z-10"
              >
                <div className="flex items-center gap-2.5">
                  <Info className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="text-slate-300">Front scan loaded. Process back side too for absolute fidelity?</span>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => startCamera("back")} 
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-black font-bold text-xs rounded uppercase tracking-[0.1em]"
                  >
                    Add Back Side
                  </button>
                  <button 
                    onClick={() => { 
                      setSkipBacksidePrompt(true); 
                      handleAIScan();
                    }} 
                    className="px-3 py-1.5 text-slate-400 hover:text-white text-xs uppercase tracking-widest font-bold"
                  >
                    Skip
                  </button>
                </div>
              </motion.div>
            )}

            {/* Scanning Laser Controller Option */}
            {frontImage && (
              <div className="mt-6 pt-4 border-t border-white/10 flex justify-end relative z-10">
                <button
                  onClick={handleAIScan}
                  disabled={isScanning}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-white/5 text-black disabled:text-slate-500 font-extrabold uppercase tracking-widest px-8 py-3.5 rounded-lg text-xs transition-all shadow-lg active:scale-95"
                >
                  {isScanning ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin text-slate-500 shrink-0" />
                      <span>Scanning card structures...</span>
                    </>
                  ) : (
                    <>
                      <Camera className="w-4 h-4 shrink-0" />
                      <span>Scan & Extract Details with AI</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* AI Scanned Fields Panel */}
          <AnimatePresence>
            {(isScanning || scanResult || scanError) && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="bg-[#080808] border border-white/10 rounded-2xl p-6 shadow-xl relative overflow-hidden"
              >
                <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-5">
                  <h2 className="text-xs uppercase tracking-[0.2em] text-slate-400 font-bold flex items-center gap-2">
                    <span className="flex items-center justify-center w-5 h-5 rounded bg-emerald-500 text-black text-xs font-bold">2</span>
                    Scan Result Details
                  </h2>
                  <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">ACTIVE SCAN ENGINE</span>
                </div>

                {/* Holographic scanning effect */}
                {isScanning && (
                  <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center p-6 z-20">
                    <div className="relative w-64 h-36 border border-emerald-500/30 rounded-lg overflow-hidden bg-emerald-950/10 flex items-center justify-center">
                      <div className="absolute inset-x-0 h-[2px] bg-emerald-400 shadow-[0_0_15px_rgba(52,211,153,0.8)] animate-bounce" style={{ animationDuration: "2.5s" }} />
                      <span className="text-[10px] font-mono tracking-widest text-emerald-400/80 uppercase">Reading Card Data...</span>
                    </div>
                    <span className="text-sm font-medium text-slate-200 mt-4 animate-pulse uppercase tracking-wider">Running Vision Extraction Engine</span>
                    <p className="text-xs text-slate-500 mt-1">Cross-referencing font structures with Gemini 3.5 Flash</p>
                  </div>
                )}

                {/* Error Banner: NOT CLEAR / Retake Prompt */}
                {scanError && (
                  <div className="p-4 bg-red-950/20 border border-red-500/30 rounded-xl flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                    <div>
                      <h3 className="text-sm font-bold text-red-200 uppercase tracking-wider">Processing Interrupted</h3>
                      <p className="text-xs text-slate-300 mt-1 leading-relaxed">{scanError}</p>
                      <button 
                        onClick={() => {
                          setScanError(null);
                          if (frontImage) {
                            startCamera("front");
                          }
                        }}
                        className="mt-3 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-200 border border-red-500/30 rounded text-xs font-semibold uppercase tracking-widest select-none transition-all"
                      >
                        Try Retaking Now
                      </button>
                    </div>
                  </div>
                )}

                {/* Extracted Form Outputs */}
                {scanResult && !scanError && (
                  <div className="space-y-5">
                    <div className="p-3 bg-emerald-500/5 border border-emerald-500/15 rounded-lg flex items-center gap-2.5 text-xs text-slate-300">
                      <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>Extracted successfully! Adjust details if needed before adding to database.</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      
                      {/* Name Card Field */}
                      <div>
                        <label className="block text-[10px] text-slate-500 uppercase font-bold mb-1 ml-1">Full Name</label>
                        <div className="flex">
                          <input 
                            type="text" 
                            value={scanResult.name} 
                            onChange={(e) => handleFieldChange("name", e.target.value)}
                            className="w-full bg-white/5 border border-white/10 rounded-l-md px-3 py-2 text-sm text-slate-100 outline-none focus:outline-none focus:border-emerald-500 transition-colors" 
                          />
                          <button 
                            onClick={() => copyToClipboard(scanResult.name, "name")}
                            className="bg-white/10 px-3 rounded-r-md border border-l-0 border-white/10 text-slate-400 hover:text-emerald-400 transition-colors flex items-center justify-center shrink-0"
                            title="Copy Name"
                          >
                            {copiedField === "name" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>

                      {/* Title/Designation */}
                      <div>
                        <label className="block text-[10px] text-slate-500 uppercase font-bold mb-1 ml-1">Title / Designation</label>
                        <div className="flex">
                          <input 
                            type="text" 
                            value={scanResult.designation} 
                            onChange={(e) => handleFieldChange("designation", e.target.value)}
                            className="w-full bg-white/5 border border-white/10 rounded-l-md px-3 py-2 text-sm text-slate-100 outline-none focus:outline-none focus:border-emerald-500 transition-colors" 
                          />
                          <button 
                            onClick={() => copyToClipboard(scanResult.designation, "designation")}
                            className="bg-white/10 px-3 rounded-r-md border border-l-0 border-white/10 text-slate-400 hover:text-emerald-400 transition-colors flex items-center justify-center shrink-0"
                            title="Copy Role"
                          >
                            {copiedField === "designation" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>

                      {/* Mobile Numbers */}
                      <div>
                        <label className="block text-[10px] text-slate-500 uppercase font-bold mb-1 ml-1">Mobile / Phone Number</label>
                        <div className="flex">
                          <input 
                            type="text" 
                            value={scanResult.mobile} 
                            onChange={(e) => handleFieldChange("mobile", e.target.value)}
                            className="w-full bg-white/5 border border-white/10 rounded-l-md px-3 py-2 text-sm text-slate-100 outline-none focus:outline-none focus:border-emerald-500 transition-colors font-mono" 
                          />
                          <button 
                            onClick={() => copyToClipboard(scanResult.mobile, "mobile")}
                            className="bg-white/10 px-3 rounded-r-md border border-l-0 border-white/10 text-slate-400 hover:text-emerald-400 transition-colors flex items-center justify-center shrink-0"
                            title="Copy Phone"
                          >
                            {copiedField === "mobile" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>

                      {/* Company Name */}
                      <div>
                        <label className="block text-[10px] text-slate-500 uppercase font-bold mb-1 ml-1">Company Name</label>
                        <div className="flex">
                          <input 
                            type="text" 
                            value={scanResult.company} 
                            onChange={(e) => handleFieldChange("company", e.target.value)}
                            className="w-full bg-white/5 border border-white/10 rounded-l-md px-3 py-2 text-sm text-slate-100 outline-none focus:outline-none focus:border-emerald-500 transition-colors" 
                          />
                          <button 
                            onClick={() => copyToClipboard(scanResult.company, "company")}
                            className="bg-white/10 px-3 rounded-r-md border border-l-0 border-white/10 text-slate-400 hover:text-emerald-400 transition-colors flex items-center justify-center shrink-0"
                            title="Copy Company"
                          >
                            {copiedField === "company" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>

                      {/* Email address */}
                      <div>
                        <label className="block text-[10px] text-slate-500 uppercase font-bold mb-1 ml-1">Email Address</label>
                        <div className="flex">
                          <input 
                            type="email" 
                            value={scanResult.email} 
                            onChange={(e) => handleFieldChange("email", e.target.value)}
                            className="w-full bg-white/5 border border-white/10 rounded-l-md px-3 py-2 text-sm text-slate-100 outline-none focus:outline-none focus:border-emerald-500 transition-colors" 
                          />
                          <button 
                            onClick={() => copyToClipboard(scanResult.email, "email")}
                            className="bg-white/10 px-3 rounded-r-md border border-l-0 border-white/10 text-slate-400 hover:text-emerald-400 transition-colors flex items-center justify-center shrink-0"
                            title="Copy Email"
                          >
                            {copiedField === "email" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>

                      {/* Website url */}
                      <div>
                        <label className="block text-[10px] text-slate-500 uppercase font-bold mb-1 ml-1">Website URL</label>
                        <div className="flex">
                          <input 
                            type="text" 
                            value={scanResult.website} 
                            onChange={(e) => handleFieldChange("website", e.target.value)}
                            className="w-full bg-white/5 border border-white/10 rounded-l-md px-3 py-2 text-sm text-slate-100 outline-none focus:outline-none focus:border-emerald-500 transition-colors" 
                          />
                          <button 
                            onClick={() => copyToClipboard(scanResult.website, "website")}
                            className="bg-white/10 px-3 rounded-r-md border border-l-0 border-white/10 text-slate-400 hover:text-emerald-400 transition-colors flex items-center justify-center shrink-0"
                            title="Copy URL"
                          >
                            {copiedField === "website" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>

                    </div>

                    {/* Full Address */}
                    <div>
                      <label className="block text-[10px] text-slate-500 uppercase font-bold mb-1 ml-1">Physical Address</label>
                      <div className="flex">
                        <textarea 
                          rows={2}
                          value={scanResult.address} 
                          onChange={(e) => handleFieldChange("address", e.target.value)}
                          className="w-full bg-white/5 border border-white/10 rounded-l-md px-3 py-2 text-sm text-slate-100 outline-none focus:outline-none focus:border-emerald-500 h-20 resize-none" 
                        />
                        <button 
                          onClick={() => copyToClipboard(scanResult.address, "address")}
                          className="bg-white/10 px-3 rounded-r-md border border-l-0 border-white/10 text-slate-400 hover:text-emerald-400 transition-colors flex flex-col items-center justify-center shrink-0"
                          title="Copy Address"
                        >
                          {copiedField === "address" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>

                    {/* Actions button log to List */}
                    <div className="pt-4 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-white/5 mt-2">
                      <div className="flex items-center gap-2 text-emerald-450 font-bold">
                        <CheckCircle className="w-4 h-4 animate-pulse shrink-0 text-emerald-400" />
                        <span className="text-[10px] uppercase tracking-widest font-mono">Auto-Saved to Archive</span>
                      </div>
                      
                      <div className="flex gap-2.5 w-full sm:w-auto">
                        <button
                          onClick={resetScanEngine}
                          className="flex-1 sm:flex-initial px-4 py-2.5 border border-white/15 rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-white/5 text-slate-300 transition-all text-center"
                          title="Clear scanning input"
                        >
                          Clear
                        </button>
                        <button
                          onClick={resetScanEngine}
                          className="flex-1 sm:flex-initial px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-black font-extrabold rounded-xl text-xs uppercase tracking-widest transition-all shadow-md active:scale-95 flex items-center justify-center gap-1.5"
                          title="Scan another brand-new card"
                        >
                          <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                          <span>Scan Next</span>
                        </button>
                      </div>
                    </div>

                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

        </section>

        {/* Right Hand Contacts Queue & Synchronization Panel */}
        <section className="lg:col-span-5 space-y-6">
          
          {/* Quick Actions Container & Database sync */}
          <div className="bg-[#0a0a0a] border border-white/10 rounded-2xl p-6 shadow-xl relative overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-5">
              <h2 className="text-xs uppercase tracking-[0.2em] text-slate-400 font-bold flex items-center gap-2">
                Spreadsheet Export Desk
              </h2>
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            </div>

            {/* Offline Excel Download Action */}
            <button
              onClick={handleExportCSV}
              className="w-full inline-flex items-center justify-center gap-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 font-bold py-3 px-4 rounded-lg text-xs uppercase tracking-widest transition-all shadow-md text-center active:scale-95"
            >
              <Download className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Export Offline Excel (.CSV)</span>
            </button>

            {/* Google Sheets Live synchronization */}
            <div className="mt-6 pt-5 border-t border-white/10">
              <span className="text-[10px] font-bold tracking-widest uppercase text-slate-400 block mb-3">Google Sheets Workspace Sync</span>
              
              {isFirebasePlaceholder ? (
                <div className="p-4 bg-amber-950/20 rounded-xl border border-amber-500/20 text-slate-300">
                  <div className="flex items-center gap-2 text-amber-400 mb-2">
                    <Info className="w-4.5 h-4.5 shrink-0" />
                    <span className="text-[10px] font-bold uppercase tracking-widest">Workspace Sync Setup Required</span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-slate-400">
                    Google Sheets live sync requires provisioning Google OAuth credentials. Configure Workspace scopes from the settings panel to activate synchronization.
                  </p>
                </div>
              ) : !user ? (
                <div className="p-4 bg-[#080808] rounded-xl border border-dashed border-white/10 text-center">
                  <p className="text-xs text-slate-400 leading-relaxed">Connect to dynamic Google Sheets to stream scanned contact telemetry into Workspace documents in real time.</p>
                  <button
                    onClick={handleGoogleLogin}
                    disabled={isLoggingIn}
                    className="mt-4 inline-flex items-center gap-2.5 bg-white text-black hover:bg-slate-200 px-5 py-2.5 rounded-lg text-xs font-extrabold uppercase tracking-widest transition-all shadow"
                  >
                    <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="w-3.5 h-3.5 shrink-0">
                      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                    </svg>
                    <span>Connect Live Google Sheets</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex gap-2">
                    <button
                      onClick={() => setSheetsActionType("create")}
                      className={`flex-1 py-2 rounded text-xs font-bold uppercase tracking-wider border ${sheetsActionType === "create" ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-400" : "bg-white/5 border-white/10 text-slate-400 hover:text-slate-200"}`}
                    >
                      Fresh Spreadsheet
                    </button>
                    <button
                      onClick={() => setSheetsActionType("existing")}
                      className={`flex-1 py-2 rounded text-xs font-bold uppercase tracking-wider border ${sheetsActionType === "existing" ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-400" : "bg-white/5 border-white/10 text-slate-400 hover:text-slate-200"}`}
                    >
                      Pasted Existing
                    </button>
                  </div>

                  {sheetsActionType === "existing" ? (
                    <div>
                      <label className="block text-[10px] text-slate-500 uppercase font-bold mb-1 ml-1">Spreadsheet URL or Identifier</label>
                      <input 
                        type="text" 
                        placeholder="https://docs.google.com/spreadsheets/d/..." 
                        value={existingSheetUrl}
                        onChange={(e) => setExistingSheetUrl(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 focus:border-emerald-500 rounded px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 outline-none transition-colors"
                      />
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-400 bg-white/5 p-3 rounded border border-white/10">
                      Standard dynamic file creation: <span className="text-emerald-400 italic">"InstaScan AI Cards Archive"</span> will be generated automatically inside Google Drive.
                    </p>
                  )}

                  {sheetsMessage && (
                    <div className={`p-3 rounded text-xs flex items-start gap-2 border ${sheetsMessage.type === "success" ? "bg-emerald-950/20 border-emerald-500/30 text-emerald-300" : "bg-red-950/20 border-red-500/30 text-red-300"}`}>
                      {sheetsMessage.type === "success" ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" /> : <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />}
                      <span className="leading-relaxed">{sheetsMessage.text}</span>
                    </div>
                  )}

                  <button
                    onClick={handleSheetsExport}
                    disabled={isSyncingSheets}
                    className="w-full inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-black font-extrabold py-3 px-4 rounded-lg text-xs uppercase tracking-widest transition-all active:scale-95"
                  >
                    {isSyncingSheets ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Synchronizing Workspace...</span>
                      </>
                    ) : (
                      <>
                        <Link className="w-3.5 h-3.5" />
                        <span>Sync Contacts Database</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>

          </div>

          {/* Collected Cards Local Queue History */}
          <div className="bg-gradient-to-br from-[#0c132a]/60 to-[#040814]/80 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl relative overflow-hidden flex flex-col justify-between transition-all duration-300 hover:border-cyan-500/20">
            <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: "radial-gradient(#22d3ee 0.5px, transparent 0.5px)", backgroundSize: "16px 16px" }} />
            
            <div className="relative z-10">
              <div className="flex items-center justify-between border-b border-white/5 pb-4 mb-5">
                <div className="flex items-center gap-2.5">
                  <h2 className="text-xs uppercase tracking-[0.2em] text-slate-300 font-display font-bold flex items-center gap-2">
                    Scanned Card Archive
                  </h2>
                  <span className="text-[10px] bg-cyan-950/30 text-cyan-400 font-mono font-black px-2.5 py-0.5 rounded-full border border-cyan-500/15">
                    {records.length} saved
                  </span>
                </div>
                {records.length > 0 && (
                  <button 
                    onClick={() => {
                      setConfirmDialog({
                        title: "Clear Archive",
                        message: "Clear all scanned contacts from your local browser storage? This cannot be undone.",
                        confirmText: "Clear All",
                        onConfirm: () => {
                          saveRecordsToLocal([]);
                          setSelectedRecordIds([]);
                          setSelectedRecord(null);
                          triggerToast("Scanned archive cleared.", "info");
                        }
                      });
                    }}
                    className="text-[10px] uppercase tracking-widest font-black text-slate-400 hover:text-red-400 transition-colors"
                  >
                    Clear All
                  </button>
                )}
              </div>

              {/* Dynamic Actions Bar for Selected Contacts (Sliding Slide-in Panel) */}
              {selectedRecordIds.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0, y: -10 }}
                  animate={{ opacity: 1, height: "auto", y: 0 }}
                  exit={{ opacity: 0, height: 0, y: -10 }}
                  className="mb-4 overflow-hidden"
                >
                  <div className="p-3.5 bg-cyan-950/20 border border-cyan-500/25 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 text-xs text-slate-200">
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-md bg-cyan-500 flex items-center justify-center text-black font-extrabold font-mono text-[10px]">
                        {selectedRecordIds.length}
                      </div>
                      <span className="font-medium">particular contacts selected</span>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openExportWizard("selected")}
                        className="px-3 py-1.5 bg-cyan-500 hover:bg-cyan-400 text-black font-black uppercase text-[9.5px] tracking-wider rounded-lg transition-all active:scale-95"
                      >
                        Export Checked
                      </button>
                      <button
                        onClick={handleDeleteSelectedRecords}
                        className="px-3 py-1.5 bg-red-950/20 hover:bg-red-950/45 text-red-400 hover:text-red-300 font-bold uppercase text-[9.5px] tracking-wider rounded-lg border border-red-500/20 transition-all"
                      >
                        Delete Checked
                      </button>
                      <button
                        onClick={() => setSelectedRecordIds([])}
                        className="px-2 py-1 text-slate-400 hover:text-white text-[10px] font-bold uppercase tracking-wider"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Search contacts & Select All controls banner */}
              {records.length > 0 && (
                <div className="space-y-3.5 mb-4">
                  <div className="relative">
                    <input 
                      type="text" 
                      placeholder="Filter archive by name, role or company..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full bg-[#080d22]/50 border border-white/5 focus:border-cyan-500/40 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder:text-slate-500 outline-none transition-all pl-9"
                    />
                    <svg className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>

                  {filteredRecords.length > 0 && (
                    <div className="flex items-center justify-between px-1 text-[11px] text-slate-400">
                      <button
                        type="button"
                        onClick={() => {
                          const allIds = filteredRecords.map(r => r.id);
                          const isAllSelected = allIds.every(id => selectedRecordIds.includes(id));
                          if (isAllSelected) {
                            setSelectedRecordIds(selectedRecordIds.filter(id => !allIds.includes(id)));
                          } else {
                            // Merge and keep unique
                            setSelectedRecordIds(Array.from(new Set([...selectedRecordIds, ...allIds])));
                          }
                        }}
                        className="flex items-center gap-2 hover:text-[#22d3ee] transition-colors select-none font-bold text-[10px] uppercase tracking-wider"
                      >
                        <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${
                          filteredRecords.map(r => r.id).every(id => selectedRecordIds.includes(id))
                            ? "bg-cyan-500 border-cyan-500 text-black"
                            : "border-white/20 bg-white/5 hover:border-white/30"
                        }`}>
                          {filteredRecords.map(r => r.id).every(id => selectedRecordIds.includes(id)) && (
                            <Check className="w-3 h-3" />
                          )}
                        </div>
                        <span>Select All Filtered</span>
                      </button>

                      {selectedRecordIds.length > 0 && (
                        <button
                          onClick={() => setSelectedRecordIds([])}
                          className="hover:text-white transition-colors"
                        >
                          Clear Selection ({selectedRecordIds.length})
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Cards logs lists with glacier transitions */}
              <div className="space-y-3.5 max-h-[360px] overflow-y-auto pr-1">
                {filteredRecords.length === 0 ? (
                  <div className="py-14 text-center p-4 border border-dashed border-white/5 bg-white/[0.01] rounded-xl">
                    <Smartphone className="w-8 h-8 text-cyan-500/20 mx-auto mb-2.5" />
                    <p className="text-xs text-slate-400 uppercase tracking-widest font-display font-medium">No Contacts Found</p>
                    <p className="text-[10px] text-slate-500 mt-1 lines-normal max-w-xs mx-auto">Trigger camera scanning sequences or load contact snapshots from storage to record archives.</p>
                  </div>
                ) : (
                  filteredRecords.map((record) => {
                    const isChecked = selectedRecordIds.includes(record.id);
                    return (
                      <motion.div
                        layoutId={`item-card-${record.id}`}
                        key={record.id}
                        onClick={() => setSelectedRecord(record)}
                        className={`group p-4 rounded-xl cursor-pointer flex items-center justify-between gap-3 transition-all border ${
                          isChecked 
                            ? "bg-cyan-950/15 border-cyan-500/30 shadow-[0_0_15px_rgba(34,211,238,0.05)]" 
                            : "bg-[#060c1d]/60 border-white/5 hover:bg-[#09122c]/70 hover:border-white/10"
                        }`}
                      >
                        {/* Interactive Left Side Checkbox */}
                        <div 
                          onClick={(e) => {
                            e.stopPropagation(); // prevent opening details View pop-up
                            if (isChecked) {
                              setSelectedRecordIds(selectedRecordIds.filter(id => id !== record.id));
                            } else {
                              setSelectedRecordIds([...selectedRecordIds, record.id]);
                            }
                          }}
                          className="p-1 -ml-1 pr-1 shrink-0 group/check"
                        >
                          <div className={`w-4 h-4 rounded flex items-center justify-center transition-all ${
                            isChecked
                              ? "bg-cyan-500 border-cyan-500 text-black"
                              : "border-white/25 bg-white/2 group-hover/check:border-cyan-400 group-hover/check:bg-cyan-500/5"
                          }`}>
                            {isChecked && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                          </div>
                        </div>

                        <div className="min-w-0 flex-1 pr-1">
                          <h4 className="text-sm font-bold text-slate-100 truncate group-hover:text-cyan-400 transition-colors uppercase font-display">{record.data.name}</h4>
                          <p className="text-[11px] text-slate-400 truncate mt-0.5">{record.data.designation && `${record.data.designation} • `}{record.data.company}</p>
                          <p className="text-[9px] font-bold text-slate-500 font-mono mt-1.5 uppercase tracking-wider">{record.timestamp}</p>
                        </div>
                        
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedRecord(record);
                            }}
                            className="p-1 px-1.5 bg-white/5 border border-white/5 hover:border-cyan-500/30 text-slate-400 hover:text-cyan-400 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all"
                            title="Open Glacier View"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              copyRecordText(record);
                            }}
                            className="p-1 px-1.5 bg-white/5 border border-white/5 hover:border-cyan-500/30 text-slate-400 hover:text-cyan-400 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all"
                            title="Copy Contact Details"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmDialog({
                                title: "Delete Contact",
                                message: `Permanently delete contact for "${record.data.name}"?`,
                                confirmText: "Delete",
                                onConfirm: () => {
                                  saveRecordsToLocal(records.filter(r => r.id !== record.id));
                                  setSelectedRecordIds(selectedRecordIds.filter(id => id !== record.id));
                                  if (selectedRecord?.id === record.id) {
                                    setSelectedRecord(null);
                                  }
                                  triggerToast("Contact deleted.", "info");
                                }
                              });
                            }}
                            className="p-1.5 text-slate-500 hover:text-red-400 transition-colors"
                            title="Delete Item"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                          <ChevronRight className="w-4 h-4 text-slate-600 group-hover:translate-x-0.5 transition-transform" />
                        </div>
                      </motion.div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

        </section>

      </main>

      {/* Global Embedded Immersive Real-time Video Viewfinder Modal */}
      <AnimatePresence>
        {isCameraActive && (
          <div className="fixed inset-0 z-50 bg-black/95 flex flex-col items-center justify-center p-4">
            
            <div className="relative w-full max-w-2xl bg-[#0a0a0a] border border-white/10 rounded-2xl overflow-hidden shadow-2xl flex flex-col">
              
              {/* Header inside modal */}
              <div className="absolute top-4 left-4 right-4 z-20 flex items-center justify-between pointer-events-none">
                <span className="bg-black/90 backdrop-blur border border-white/10 text-emerald-400 text-[9px] font-bold px-3 py-1.5 rounded-full uppercase tracking-widest flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                  Live Camera Scanner Active
                </span>
                <button 
                  onClick={stopCamera} 
                  className="pointer-events-auto p-2 bg-black/70 hover:bg-black rounded-full border border-white/10 text-white transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              {/* Viewport Box */}
              <div className="relative aspect-[1.58/1] bg-black max-h-[80vh] flex items-center justify-center overflow-hidden">
                <video 
                  ref={videoRef} 
                  autoPlay 
                  playsInline 
                  muted 
                  className="w-full h-full object-cover"
                />

                {/* Laser scan horizontal line */}
                <div className="absolute inset-x-0 h-0.5 bg-emerald-400 shadow-lg shadow-emerald-400/85 animate-ping pointer-events-none" style={{ animationDuration: "3s" }} />

                {/* Grid Overlay frame representing visiting cards aspect limits */}
                <div className="absolute inset-8 border border-dashed border-white/20 rounded-xl pointer-events-none flex items-center justify-center">
                  <div className="w-full h-full max-w-sm max-h-[220px] border border-emerald-450/40 rounded-lg flex flex-col items-center justify-center bg-emerald-950/5 relative">
                    <div className="absolute top-2 left-2 w-4 h-0.5 bg-emerald-400" />
                    <div className="absolute top-2 left-2 w-0.5 h-4 bg-emerald-400" />
                    <div className="absolute top-2 right-2 w-4 h-0.5 bg-emerald-400" />
                    <div className="absolute top-2 right-2 w-0.5 h-4 bg-emerald-400" />
                    <div className="absolute bottom-2 left-2 w-4 h-0.5 bg-emerald-400" />
                    <div className="absolute bottom-2 left-2 w-0.5 h-4 bg-emerald-400" />
                    <div className="absolute bottom-2 right-2 w-4 h-0.5 bg-emerald-400" />
                    <div className="absolute bottom-2 right-2 w-0.5 h-4 bg-emerald-400" />
                    <span className="text-[9px] font-mono tracking-widest text-[#4ade80] opacity-80 uppercase select-none">Align Card details inside frame</span>
                  </div>
                </div>
              </div>

              {/* Controls bar inside modal */}
              <div className="bg-[#080808] border-t border-white/10 p-4 shrink-0 flex items-center justify-between gap-4">
                <button
                  type="button"
                  onClick={toggleCameraFacing}
                  className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 rounded text-[10px] font-bold uppercase tracking-widest transition-all"
                >
                  Switch Lens
                </button>

                <button
                  onClick={captureImage}
                  className="w-14 h-14 bg-white hover:bg-zinc-200 flex items-center justify-center rounded-full border-4 border-[#10b981] shadow-lg transition-transform active:scale-90"
                  title="Snap photo"
                >
                  <div className="w-5 h-5 bg-[#0a0a0a] rounded-full" />
                </button>

                <button
                  onClick={stopCamera}
                  className="px-4 py-2 bg-red-950/20 hover:bg-red-950/40 text-red-400 rounded text-[10px] font-bold uppercase tracking-widest transition-all"
                >
                  Cancel
                </button>
              </div>

            </div>

          </div>
        )}
      </AnimatePresence>

      {/* Corporate Digital Card Overlay View Modal */}
      <AnimatePresence>
        {selectedRecord && (
          <div className="fixed inset-0 z-50 bg-[#020617]/90 backdrop-blur-md flex items-center justify-center p-4">
            {/* Backdrop click to dismiss */}
            <div className="absolute inset-0 z-0" onClick={() => setSelectedRecord(null)} />
            
            <motion.div
              layoutId={`item-card-${selectedRecord.id}`}
              className="bg-gradient-to-b from-[#0b1227] to-[#040815] border border-white/10 rounded-2xl w-full max-w-md max-h-[85vh] overflow-y-auto shadow-2xl relative z-10 scrollbar-thin scrollbar-thumb-white/10"
            >
              
              {/* Top-Right Absolute Close Button */}
              <button
                onClick={() => setSelectedRecord(null)}
                className="absolute top-4.5 right-4.5 z-30 p-2 rounded-full bg-white/5 hover:bg-white/15 text-slate-400 hover:text-white border border-white/5 backdrop-blur transition-all active:scale-90"
                title="Go Back / Close Details"
                id="close-badge-modal-btn"
              >
                <X className="w-4 h-4 shrink-0" />
              </button>
              
              {/* Virtual Badge Container */}
              <div className="p-6 bg-[#080808] border-b border-white/10 relative">
                
                {/* Virtual logo bar */}
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                    <span className="text-[9.5px] font-mono tracking-widest text-slate-400 uppercase font-black">{selectedRecord.data.company || "CORPORATE STAFF"}</span>
                  </div>
                  <FileSpreadsheet className="w-4 h-4 text-emerald-400/80" />
                </div>

                {/* Identity */}
                <div className="space-y-1">
                  <h3 className="text-lg font-extrabold text-white tracking-tight">{selectedRecord.data.name}</h3>
                  <p className="text-[10px] font-bold text-emerald-400 tracking-widest uppercase mb-1">{selectedRecord.data.designation || "EXECUTIVE MEMBER"}</p>
                  <div className="flex items-center gap-1">
                    <Building className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    <span className="text-xs text-slate-300 font-bold uppercase tracking-wider">{selectedRecord.data.company || "Independent Contractor"}</span>
                  </div>
                </div>

                {/* Subtle digital background grids */}
                <div className="absolute right-4 bottom-4 w-28 h-28 border border-white/[0.015] rounded-full pointer-events-none flex items-center justify-center">
                  <div className="w-16 h-16 border border-white/[0.025] rounded-full" />
                </div>

              </div>

              {/* Verified details panel */}
              <div className="p-6 space-y-5 bg-black/40">
                
                {/* Contact grids */}
                <div className="space-y-4 text-xs text-slate-300">
                  {selectedRecord.data.mobile && (
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-white/5 rounded flex items-center justify-center text-slate-400 border border-white/5 shrink-0">
                        <Smartphone className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[9px] text-slate-500 uppercase font-bold tracking-widest">Mobile Phone</div>
                        <a href={`tel:${selectedRecord.data.mobile}`} className="font-mono text-slate-200 hover:text-emerald-400 truncate block hover:underline text-xs">{selectedRecord.data.mobile}</a>
                      </div>
                    </div>
                  )}

                  {selectedRecord.data.email && (
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-white/5 rounded flex items-center justify-center text-slate-400 border border-white/5 shrink-0">
                        <Mail className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[9px] text-slate-500 uppercase font-bold tracking-widest">Email Address</div>
                        <a href={`mailto:${selectedRecord.data.email}`} className="text-slate-200 hover:text-emerald-400 truncate block hover:underline text-xs">{selectedRecord.data.email}</a>
                      </div>
                    </div>
                  )}

                  {selectedRecord.data.website && (
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-white/5 rounded flex items-center justify-center text-slate-400 border border-white/5 shrink-0">
                        <Globe className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[9px] text-slate-500 uppercase font-bold tracking-widest">Website</div>
                        <a href={selectedRecord.data.website.startsWith("http") ? selectedRecord.data.website : `https://${selectedRecord.data.website}`} target="_blank" rel="noopener noreferrer" className="text-slate-200 hover:text-emerald-400 truncate block hover:underline text-xs">{selectedRecord.data.website}</a>
                      </div>
                    </div>
                  )}

                  {selectedRecord.data.address && (
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-white/5 rounded flex items-center justify-center text-slate-400 border border-white/5 shrink-0">
                        <MapPin className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1 w-full">
                        <div className="text-[9px] text-slate-500 uppercase font-bold tracking-widest">Physical Address</div>
                        <p className="text-slate-200 leading-normal text-xs">{selectedRecord.data.address}</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Card thumbnail side comparison */}
                <div className="flex gap-3 pt-3 border-t border-white/5 text-[9px] text-slate-400">
                  <div className="flex-1">
                    <span className="uppercase tracking-widest font-bold text-slate-500">[FRONT SNAPS]</span>
                    <div className="aspect-[1.58/1] rounded bg-black overflow-hidden border border-white/10 mt-1">
                      <img src={selectedRecord.frontImage} alt="Front Card" className="w-full h-full object-cover" />
                    </div>
                  </div>
                  {selectedRecord.backImage && (
                    <div className="flex-1">
                      <span className="uppercase tracking-widest font-bold text-slate-500">[BACK SNAPS]</span>
                      <div className="aspect-[1.58/1] rounded bg-black overflow-hidden border border-white/10 mt-1">
                        <img src={selectedRecord.backImage} alt="Back Card" className="w-full h-full object-cover" />
                      </div>
                    </div>
                  )}
                </div>

                {/* Copy / Message actions */}
                <div className="space-y-3.5 pt-3">
                  <div className="flex gap-2">
                    <button
                      onClick={() => copyRecordText(selectedRecord)}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 py-3 bg-emerald-600 hover:bg-emerald-500 text-black text-xs font-extrabold uppercase tracking-widest rounded-lg transition-all"
                    >
                      {isCopiedText ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{isCopiedText ? "COPIED" : "COPY TEXT CARD"}</span>
                    </button>
                    
                    {/* Share directly WhatsApp */}
                    {selectedRecord.data.mobile && (
                      <a
                        href={`https://api.whatsapp.com/send?text=${encodeURIComponent(
                          `--- Digital Address: ${selectedRecord.data.name} --- \nPhone: ${selectedRecord.data.mobile}\nCompany: ${selectedRecord.data.company}\nEmail: ${selectedRecord.data.email}`
                        )}`}
                        target="_blank"
                        rel="noreferrer"
                        className="p-3 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 hover:text-white rounded-lg flex items-center justify-center font-bold text-xs"
                        title="Send via WhatsApp"
                      >
                        <Share2 className="w-4 h-4" />
                      </a>
                    )}
                  </div>

                  <div className="flex justify-between items-center text-[9px] text-slate-500 font-mono">
                    <span>INDEX: {selectedRecord.id.slice(0, 8).toUpperCase()}</span>
                    <span>TRACKED: {selectedRecord.timestamp}</span>
                  </div>

                  <button
                    onClick={() => setSelectedRecord(null)}
                    className="w-full py-3 border border-white/10 text-slate-400 hover:text-white rounded-lg text-xs font-bold uppercase tracking-widest hover:bg-white/5 transition-all text-center"
                  >
                    Close View
                  </button>
                </div>

              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Glacier interactive CSV Export Wizard Popup */}
      <AnimatePresence>
        {isExportModalOpen && (
          <div className="fixed inset-0 z-50 bg-[#020617]/85 backdrop-blur-md flex items-center justify-center p-4">
            {/* Click outside to close standard overlay behavior */}
            <div className="absolute inset-0 z-0" onClick={() => setIsExportModalOpen(false)} />

            <motion.div
              initial={{ scale: 0.95, y: 15, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.95, y: 15, opacity: 0 }}
              className="bg-gradient-to-b from-[#0b1430] to-[#040816] border border-[#22d3ee]/20 text-slate-100 rounded-2xl w-full max-w-lg overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.8)] relative z-10 p-6 flex flex-col gap-5 max-h-[90vh] overflow-y-auto scrollbar-thin scrollbar-thumb-white/10"
            >
              {/* Header */}
              <div className="flex items-start justify-between border-b border-white/5 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-cyan-950/40 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
                    <Download className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-black font-display tracking-tight text-white uppercase">Glacier File Export Wizard</h3>
                    <p className="text-[10px] text-slate-400 font-mono tracking-widest uppercase mt-0.5">Offline Contacts compiler</p>
                  </div>
                </div>

                <button
                  onClick={() => setIsExportModalOpen(false)}
                  className="p-1.5 rounded-full bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-all active:scale-90"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Form parameters */}
              <div className="space-y-4 text-xs">
                
                {/* Export filename */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
                    <span>Filename Specification</span>
                    <span className="text-cyan-500">*</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={exportFilename}
                      onChange={(e) => setExportFilename(e.target.value)}
                      placeholder="e.g. InstaScan_Contacts"
                      className="flex-1 bg-[#050918] border border-white/10 focus:border-cyan-500 rounded-xl px-3.5 py-3 text-slate-100 font-mono outline-none transition-all text-xs"
                    />
                    <span className="text-slate-500 font-mono font-medium pr-1">.csv</span>
                  </div>
                  <p className="text-[10px] text-slate-500">Specify an appropriate name for saving your contacts database. Special characters are automatically sanitized.</p>
                </div>

                {/* Date range filter */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Select Contacts Range / Segment</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setExportDateRange("all")}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        exportDateRange === "all"
                          ? "bg-cyan-500/10 border-cyan-500 text-cyan-300"
                          : "bg-white/[0.02] border-white/5 hover:border-white/15 text-slate-300"
                      }`}
                    >
                      <div className="font-bold text-xs uppercase">All Contacts</div>
                      <div className="text-[10px] text-slate-400 mt-1">Export full local archive ({records.length})</div>
                    </button>

                    <button
                      type="button"
                      disabled={selectedRecordIds.length === 0}
                      onClick={() => setExportDateRange("selected")}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        selectedRecordIds.length === 0 ? "opacity-30 cursor-not-allowed" : ""
                      } ${
                        exportDateRange === "selected"
                          ? "bg-cyan-500/10 border-cyan-500 text-cyan-300"
                          : "bg-white/[0.02] border-white/5 hover:border-white/15 text-slate-300"
                      }`}
                    >
                      <div className="font-bold text-xs uppercase">Checked Only</div>
                      <div className="text-[10px] text-slate-400 mt-1">Export checked items ({selectedRecordIds.length})</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setExportDateRange("past24h")}
                      className={`p-3 rounded-xl border text-left transition-all col-span-2 sm:col-span-1 ${
                        exportDateRange === "past24h"
                          ? "bg-cyan-500/10 border-cyan-500 text-cyan-300"
                          : "bg-white/[0.02] border-white/5 hover:border-white/15 text-slate-300"
                      }`}
                    >
                      <div className="font-bold text-xs uppercase">Past 24 Hours</div>
                      <div className="text-[10px] text-slate-400 mt-1">Contacts logged in last 24h</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setExportDateRange("past7d")}
                      className={`p-3 rounded-xl border text-left transition-all col-span-2 sm:col-span-1 ${
                        exportDateRange === "past7d"
                          ? "bg-cyan-500/10 border-cyan-500 text-cyan-300"
                          : "bg-white/[0.02] border-white/5 hover:border-white/15 text-slate-300"
                      }`}
                    >
                      <div className="font-bold text-xs uppercase">Past 7 Days</div>
                      <div className="text-[10px] text-slate-400 mt-1">Contacts logged in last week</div>
                    </button>
                  </div>
                </div>

                {/* Export method: New vs Append */}
                <div className="space-y-1.5 pt-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Select Output Destination Workflow</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setExportMethod("new")}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        exportMethod === "new"
                          ? "bg-cyan-500/10 border-cyan-500 text-cyan-300"
                          : "bg-white/[0.02] border-white/5 hover:border-white/15 text-slate-300"
                      }`}
                    >
                      <div className="font-black text-xs uppercase">Create New File</div>
                      <div className="text-[10px] text-slate-500 mt-1">Generates a fresh standalone contact file</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setExportMethod("append")}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        exportMethod === "append"
                          ? "bg-cyan-500/10 border-cyan-500 text-cyan-300"
                          : "bg-white/[0.02] border-white/5 hover:border-white/15 text-slate-300"
                      }`}
                    >
                      <div className="font-black text-xs uppercase">Append to Existing</div>
                      <div className="text-[10px] text-slate-500 mt-1">Upload & write to a saved CSV</div>
                    </button>
                  </div>
                </div>

                {/* Upload Section if Append Selected */}
                <AnimatePresence>
                  {exportMethod === "append" && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="space-y-2 border border-dashed border-[#22d3ee]/20 bg-cyan-950/5 p-3.5 rounded-xl overflow-hidden"
                    >
                      <span className="text-[9.5px] font-bold uppercase tracking-wider text-cyan-400">[Offline Base Contacts CSV File]</span>
                      <div className="flex flex-col gap-2 mt-1">
                        <input
                          type="file"
                          accept=".csv"
                          onChange={handleFileToAppendChange}
                          id="append-file-picker"
                          className="hidden"
                        />
                        <div className="flex items-center gap-3">
                          <label
                            htmlFor="append-file-picker"
                            className="px-3.5 py-2.5 bg-[#0b1430] hover:bg-cyan-500/10 text-cyan-400 rounded-lg text-[10px] font-black uppercase tracking-wider border border-cyan-500/15 cursor-pointer block transition-all"
                          >
                            Browse Files...
                          </label>
                          <span className="text-[10.5px] text-slate-400 font-mono truncate max-w-[250px]">
                            {appendFile ? appendFile.name : "Select existing .csv file"}
                          </span>
                        </div>

                        {/* Status feedback */}
                        {parsingCSV && (
                          <div className="text-[10px] text-cyan-400 font-bold flex items-center gap-1.5 animate-pulse">
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>Parsing local CSV file details...</span>
                          </div>
                        )}

                        {appendStatus && (
                          <div className={`p-2 rounded text-[10px] tracking-normal font-medium border flex items-start gap-1.5 ${
                            appendStatus.type === "success"
                              ? "bg-emerald-950/30 border-emerald-500/25 text-emerald-400"
                              : "bg-red-950/20 border-red-500/20 text-red-400"
                          }`}>
                            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                            <span className="leading-snug">{appendStatus.msg}</span>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Helpful Instruction Note about selecting paths/directories */}
                <div className="text-[10.5px] text-slate-400 flex items-start gap-2 bg-white/2 p-3 rounded-xl border border-white/5 leading-normal">
                  <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                  <span>
                    <strong>Directory Selection:</strong> To prompt for custom local storage paths dynamically upon every export task, ensure your browser settings for "Downloads" is configured to <em>"Ask where to save each file before downloading"</em>. No data ever leaves your computer.
                  </span>
                </div>

              </div>

              {/* Actions buttons */}
              <div className="flex items-center justify-end gap-3.5 border-t border-white/5 pt-4.5">
                <button
                  type="button"
                  onClick={() => setIsExportModalOpen(false)}
                  className="px-4 py-2.5 bg-white/5 hover:bg-white/10 text-slate-300 font-black uppercase text-[10.5px] tracking-wider rounded-xl transition-all"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={executeCSVExport}
                  disabled={exportMethod === "append" && !appendFile}
                  className={`px-5 py-2.5 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 disabled:hover:bg-cyan-500 text-black font-black uppercase text-[10.5px] tracking-widest rounded-xl transition-all shadow-[0_4px_20px_rgba(34,211,238,0.25)] flex items-center gap-1.5`}
                >
                  <Download className="w-3.5 h-3.5 shrink-0 stroke-[2.5]" />
                  <span>Compile & Download</span>
                </button>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Workspace OAuth Credentials Info Modal */}
      <AnimatePresence>
        {showAuthSetupModal && (
          <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#0b0b0b] border border-amber-500/20 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl relative"
            >
              <div className="p-6 bg-gradient-to-b from-amber-950/20 to-transparent border-b border-white/5 relative">
                <div className="flex items-center gap-3 mb-3 text-amber-400">
                  <Info className="w-5 h-5 shrink-0" />
                  <span className="text-[11px] font-bold uppercase tracking-widest">Workspace OAuth Connection Guidance</span>
                </div>
                <h3 className="text-base font-black text-white leading-snug tracking-tight">Set Up Live Google Sheets Synchronization</h3>
                <p className="text-[11px] text-slate-400 leading-relaxed mt-2">
                  To stream scanned contact details directly into Google Sheets in real-time, your environment requires active Google Workspace API credentials.
                </p>
              </div>

              <div className="p-6 space-y-4">
                <div className="space-y-3.5 text-xs text-slate-300">
                  <div className="flex gap-3">
                    <div className="w-6 h-6 bg-white/5 rounded flex items-center justify-center text-amber-400 border border-white/5 shrink-0 font-mono font-bold text-xs flex-col">
                      1
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[9px] text-slate-500 uppercase font-bold tracking-widest mb-0.5 font-sans">Authorization Settings</div>
                      <p className="text-[11px] leading-relaxed text-slate-350">
                        Open the <strong>Settings</strong> menu in the top-right of your AI Studio workspace.
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <div className="w-6 h-6 bg-white/5 rounded flex items-center justify-center text-amber-400 border border-white/5 shrink-0 font-mono font-bold text-xs flex-col">
                      2
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[9px] text-slate-500 uppercase font-bold tracking-widest mb-0.5 font-sans">Define Scopes</div>
                      <p className="text-[11px] leading-relaxed text-slate-350">
                        Add the Google Sheets and Google Drive scopes required to connect and create spreadsheets with your user's permission.
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <div className="w-6 h-6 bg-white/5 rounded flex items-center justify-center text-amber-500 border border-white/5 shrink-0 font-mono font-bold text-xs flex-col">
                      3
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[9px] text-slate-500 uppercase font-bold tracking-widest mb-0.5 font-sans">Local Storage Fallback</div>
                      <p className="text-[11px] leading-relaxed text-slate-400">
                        <strong>Fully Functional Offline</strong>: You can still utilize all camera, WebRTC, high-fidelity Gemini AI extractions, and export templates locally. Download your contact archives directly via <strong>Export as CSV</strong> anytime!
                      </p>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-white/5 flex gap-2">
                  <button
                    onClick={() => setShowAuthSetupModal(false)}
                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-black text-xs font-extrabold uppercase tracking-widest rounded-lg transition-all text-center"
                  >
                    Got It, Continue Offline
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Dynamic Animated Toast Notifications */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            className="fixed top-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl border shadow-2xl backdrop-blur-md max-w-sm pointer-events-auto bg-[#070c1e]/95 border-white/10"
            style={{
              borderColor: toast.type === "success" 
                ? "rgba(16, 185, 129, 0.4)" 
                : toast.type === "error" 
                ? "rgba(239, 68, 68, 0.4)" 
                : "rgba(34, 211, 238, 0.4)"
            }}
          >
            <div className="shrink-0">
              {toast.type === "success" ? (
                <CheckCircle className="w-4.5 h-4.5 text-emerald-400" />
              ) : toast.type === "error" ? (
                <AlertTriangle className="w-4.5 h-4.5 text-red-400" />
              ) : (
                <Info className="w-4.5 h-4.5 text-cyan-400" />
              )}
            </div>
            
            <div className="min-w-0 flex-1">
              <p className="text-[11.5px] text-slate-100 font-semibold leading-relaxed tracking-normal">{toast.msg}</p>
            </div>

            <button 
              onClick={() => setToast(null)}
              className="p-1 rounded-full text-slate-400 hover:text-white transition-all shrink-0 active:scale-95"
              title="Dismiss notification"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Dynamic Custom Confirmation Dialogue Modal */}
      <AnimatePresence>
        {confirmDialog && (
          <div key="confirm-modal-overlay" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-transparent">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setConfirmDialog(null)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />

            {/* Modal Body */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative w-full max-w-sm bg-gradient-to-b from-[#0c132a] to-[#040814] border border-white/10 rounded-2xl p-6 shadow-2xl relative overflow-hidden z-10"
            >
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-500/40 to-transparent" />
              
              <div className="flex items-start gap-3.5">
                <div className="p-2 bg-[#ef4444]/10 border border-[#ef4444]/20 text-[#ef4444] rounded-xl flex-shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider font-display">{confirmDialog.title}</h3>
                  <p className="text-xs text-slate-350 leading-relaxed mt-2">{confirmDialog.message}</p>
                </div>
              </div>

              <div className="flex justify-end gap-2.5 mt-6 pt-4 border-t border-white/5">
                <button
                  onClick={() => setConfirmDialog(null)}
                  className="px-3.5 py-2 border border-white/10 hover:border-white/20 text-slate-400 hover:text-slate-100 font-bold uppercase text-[10px] tracking-wider rounded-lg transition-all"
                >
                  {confirmDialog.cancelText || "Cancel"}
                </button>
                <button
                  onClick={async () => {
                    const action = confirmDialog.onConfirm;
                    setConfirmDialog(null);
                    await action();
                  }}
                  className="px-4 py-2 bg-[#ef4444] hover:bg-[#ef4444]/90 text-white font-black uppercase text-[10px] tracking-wider rounded-lg shadow-md active:scale-95 transition-all"
                >
                  {confirmDialog.confirmText || "Confirm"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Minimal branding footer overlay */}
      <footer className="border-t border-white/5 bg-black/60 py-5 px-4 text-center text-[10px] uppercase tracking-widest text-[#444] font-bold relative z-10">
        <p className="max-w-7xl mx-auto leading-relaxed">
          InstaScan AI uses server-side Google Gemini 3.5 & Workspace APIs for high-fidelity OCR retrieval. Cleared caches might remove local history archives.
        </p>
      </footer>

    </div>
  );
}
