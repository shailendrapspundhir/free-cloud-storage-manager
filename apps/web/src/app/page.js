'use client';

// Force dynamic rendering + nodejs runtime to avoid prerender/SSR errors with localStorage , auth , closures (fixes 'z' TDZ/minified init issues in build)
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { useState, useEffect, useCallback } from 'react';

export default function Home() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [token, setToken] = useState(null);
  const [files, setFiles] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadMessage, setUploadMessage] = useState('');
  // Theme state: light/dark , persisted in localStorage , applied to <html> for global dark: variants
  // Static init + useEffect sync to avoid SSR/build issues (layout script handles initial class)
  const [theme, setTheme] = useState('light');

  // Storage providers: multiple options (local now , mocks for S3/Google Drive etc.) - moved early to avoid TDZ/reference errors
  // Active provider state (default local) , current name computed , select func - before any useEffect/JSX refs
  const storageProviders = [
    { id: 'local', name: 'Local Storage', description: 'Files stored directly on server disk (uploads/)' },
    { id: 's3', name: 'AWS S3', description: 'Cloud object storage (mock connection)' },
    { id: 'gdrive', name: 'Google Drive', description: 'Personal cloud storage (mock integration)' },
  ];
  // Active provider state (default local)
  // Static init for SSR/build safety ; sync from storage in useEffect (prevents init errors)
  const [activeProvider, setActiveProvider] = useState('local');

  // Dropdown state for profile menu (moved early with other states to fix init/closure errors like 'z' TDZ in build)
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Toggle dropdown , close on outside? simple for now
  // useCallback for stability (avoids ref errors in JSX/profile)
  const toggleDropdown = useCallback(() => setDropdownOpen(!dropdownOpen), []);

  // Select/change active provider , persist , (future: connect/auth per provider)
  // useCallback for stability (prevents TDZ/closure issues in dropdown/JSX refs)
  const selectProvider = useCallback((providerId) => {
    setActiveProvider(providerId);
    localStorage.setItem('activeProvider', providerId);
    // TODO: In integrate task, route uploads to selected provider
    console.log(`Switched to storage provider: ${providerId}`);
    setDropdownOpen(false); // Close dropdown after select
  }, []); // Setters stable

  // Get current provider name for display (used in UI , upload , etc.)
  const currentProvider = storageProviders.find(p => p.id === activeProvider)?.name || 'Local Storage';

  // Fetch user's files filtered by current provider/bucket (useCallback moved early to fix TDZ/runtime init error)
  // Ensures uploaded files section shows only from selected storage (e.g., local folder)
  // useCallback stabilizes ref for useEffects , prevents stale/closure issues
  const fetchFiles = useCallback(async (authToken) => {
    try {
      const response = await fetch(`http://localhost:3000/files?provider=${activeProvider}`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });
      const data = await response.json();
      if (data.success) {
        setFiles(data.files);
      }
    } catch (error) {
      console.error('Error fetching files:', error);
    }
  }, [activeProvider]); // Dep on activeProvider for provider filter

  // Load token AND theme from localStorage on mount (persist login/theme)
  // Apply dark class to html for Tailwind/CSS vars (ensures contrast)
  useEffect(() => {
    // Theme setup: override static init from storage/system , set class (safe client-only)
    const savedTheme = localStorage.getItem('theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    setTheme(savedTheme);
    if (savedTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }

    // Active provider setup: override static init from storage
    const savedProvider = localStorage.getItem('activeProvider') || 'local';
    setActiveProvider(savedProvider);

    // Token/login setup
    const savedToken = localStorage.getItem('token');
    if (savedToken) {
      setToken(savedToken);
      fetchFiles(savedToken);
    }
  }, []);

  // Refetch files when activeProvider changes (e.g., switch bucket in dropdown)
  // Ensures "Your uploaded files" shows only from current provider's folder
  // Deps include fetchFiles (useCallback) to avoid stale closure
  useEffect(() => {
    if (token) {
      fetchFiles(token);
    }
  }, [activeProvider, token, fetchFiles]);

  // Toggle between light/dark theme , update html class + localStorage
  // Light: enforces darker fonts (#171717) + light bgs ; Dark: uses existing light fonts/dark bgs
  // Class toggle triggers CSS vars/dark: variants for full color change/re-render
  // useCallback for stability (prevents any ref/init errors)
  const toggleTheme = useCallback(() => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    // Explicit class set to force CSS vars + Tailwind dark: to apply (ensures bg/font color change)
    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light'); // Explicit light for override
    }
    // Force re-render by state (React catches class change for styled elements)
  }, [theme]);

  // Dupe storageProviders removed (defined early above for TDZ fix)
  // Toggle dropdown , close on outside? simple for now
  // (dropdownOpen state moved early to fix build/TDZ errors)

  // activeProvider , selectProvider , currentProvider already defined early (above) - no dupe

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch('http://localhost:3000/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });
      const data = await response.json();
      if (data.success && data.token) {
        setToken(data.token);
        localStorage.setItem('token', data.token);
        setMessage('Logged in successfully');
        fetchFiles(data.token);
      } else {
        setMessage(data.message || 'Login failed');
      }
    } catch (error) {
      setMessage('Error connecting to server');
    }
  };

  // fetchFiles useCallback moved early (above) to fix TDZ/init error; refs now safe

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!selectedFile) return;
    const formData = new FormData();
    formData.append('file', selectedFile);
    // Mock: include active provider in request (for future backend routing to S3 etc.)
    // Currently files go to local storage , but UI/provider state ready
    formData.append('provider', activeProvider); // Extensible
    try {
      const response = await fetch('http://localhost:3000/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });
      const data = await response.json();
      setUploadMessage(`${data.message} (via ${currentProvider})`);
      if (data.success) {
        fetchFiles(token); // Refresh list
        setSelectedFile(null);
      }
    } catch (error) {
      setUploadMessage('Upload error');
    }
  };

  const handleView = async (id) => {
    // Fetch with token, create blob URL for view (handles protected route, e.g., images/photos)
    try {
      const response = await fetch(`http://localhost:3000/files/${id}/view`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch (error) {
      alert('View error');
    }
  };

  const handleDownload = async (id, originalname) => {
    // Similar for download: blob + <a> download
    try {
      const response = await fetch(`http://localhost:3000/files/${id}/download`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = originalname;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      alert('Download error');
    }
  };

  const handleLogout = () => {
    setToken(null);
    localStorage.removeItem('token');
    setFiles([]);
    setMessage('');
  };

  // Dashboard after login
  // Dashboard wrapper: bg with dark variant for contrast
  if (token) {
    return (
      <div className="min-h-screen bg-gray-100 dark:bg-gray-900 p-8 text-gray-900 dark:text-gray-100">
        <div className="max-w-4xl mx-auto">
          /* User profile section: round logo/avatar , dropdown for settings/provider/logout - JS comment to avoid JSX parse */
          /* Shows active storage provider , theme toggle , options - improved UX */
          /* Logo: round for modern look , dropdown with dark: support for contrast */
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Free Storage Manager - Dashboard</h1>
            <div className="flex items-center space-x-2 relative">
              {/* Theme switcher button right next to profile icon (as requested) */}
              {/* Visible, contrasting button that toggles dark/light mode */}
              <button
                onClick={toggleTheme}
                className="bg-gray-500 dark:bg-gray-600 text-white px-3 py-2 rounded hover:bg-gray-600 dark:hover:bg-gray-500 text-sm"
                title="Toggle dark/light theme"
              >
                {theme === 'light' ? '🌙' : '☀️'}
              </button>
              {/* Round logo/avatar trigger for dropdown (settings, providers, logout) */}
              <button
                onClick={toggleDropdown}
                className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold hover:bg-blue-600 focus:outline-none"
                title="User profile & settings"
              >
                FS {/* Free Storage initials , round for profile */}
              </button>
              {/* Dropdown menu: visible when open , settings/provider select , logout */}
              {/* Theme button is separate next to icon; dropdown keeps other options */}
              {dropdownOpen && (
                <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-gray-800 rounded shadow-lg border dark:border-gray-700 z-10">
                  <div className="p-4 border-b dark:border-gray-700">
                    <p className="text-sm text-gray-600 dark:text-gray-400">Active Storage:</p>
                    <p className="font-semibold text-gray-900 dark:text-gray-100">{currentProvider}</p>
                  </div>
                  <div className="p-2">
                    {/* Storage providers selector in dropdown */}
                    <p className="text-xs text-gray-500 dark:text-gray-400 px-2 mb-1">Switch Provider:</p>
                    {storageProviders.map((provider) => (
                      <button
                        key={provider.id}
                        onClick={() => selectProvider(provider.id)}
                        className={`block w-full text-left px-2 py-1 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-700 ${
                          activeProvider === provider.id ? 'bg-blue-100 dark:bg-blue-900' : ''
                        }`}
                      >
                        {provider.name} - {provider.description}
                      </button>
                    ))}
                  </div>
                  <div className="border-t dark:border-gray-700 p-2">
                    {/* Logout (theme in separate button next to icon) */}
                    <button
                      onClick={handleLogout}
                      className="block w-full text-left px-2 py-1 text-sm text-red-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                    >
                      Logout
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          /* Upload section for files/photos etc. - JS comment */
          /* Upload section: shows active provider (from settings dropdown) */
          /* Mock integration: files still local , but UI reflects selected (e.g., local/S3) */
          /* Contrast ensured for dark/light */
          <div className="bg-white dark:bg-gray-800 p-6 rounded shadow-md mb-6">
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">Upload File/Photo</h2>
            {/* Visible active storage provider badge */}
            <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
              Using: <span className="font-semibold text-blue-600 dark:text-blue-400">{currentProvider}</span>
              {' '} (change in profile dropdown)
            </p>
            <form onSubmit={handleUpload}>
              {/* Styled visible 'Choose File' button (custom label for hidden input) */}
              {/* Clear marking , high contrast in light/dark themes , better UX than default input */}
              <input
                type="file"
                id="file-input"
                onChange={(e) => setSelectedFile(e.target.files[0])}
                className="hidden"
                required
              />
              <label
                htmlFor="file-input"
                className="bg-blue-500 text-white px-4 py-2 rounded cursor-pointer hover:bg-blue-600 inline-block mb-4"
              >
                Choose File
              </label>
              <button
                type="submit"
                className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 ml-2"
              >
                Upload to {currentProvider}
              </button>
            </form>
            {uploadMessage && <p className="mt-2 text-green-600 dark:text-green-400">{uploadMessage}</p>}

            {/* Selected file info shown below button (name, size, type) for better UX */}
            {/* Visible in both themes with contrast */}
            {selectedFile && (
              <div className="mt-4 p-3 bg-gray-100 dark:bg-gray-700 rounded text-sm">
                <p className="text-gray-800 dark:text-gray-200"><strong>File:</strong> {selectedFile.name}</p>
                <p className="text-gray-800 dark:text-gray-200"><strong>Size:</strong> {Math.round(selectedFile.size / 1024)} KB</p>
                <p className="text-gray-800 dark:text-gray-200"><strong>Type:</strong> {selectedFile.type}</p>
              </div>
            )}
          </div>

          {/* List files with view/download - metadata from SQLite, files from local storage */}
          <div className="bg-white dark:bg-gray-800 p-6 rounded shadow-md">
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">Your Uploaded Files</h2>
            {files.length === 0 ? (
              <p className="text-gray-600 dark:text-gray-400">No files uploaded yet. Upload photos, docs, etc. above!</p>
            ) : (
              <ul className="space-y-4">
                {files.map((file) => (
                  <li
                    key={file.id}
                    className="flex items-center justify-between border p-4 rounded"
                  >
                    <span className="text-gray-800 dark:text-gray-200">
                      {file.originalname} ({Math.round(file.size / 1024)} KB) -{' '}
                      {file.upload_date}
                    </span>
                    <div>
                      {/* View (inline for images/photos) */}
                      <button
                        onClick={() => handleView(file.id)}
                        className="bg-blue-500 text-white px-3 py-1 rounded mr-2 hover:bg-blue-600"
                      >
                        View
                      </button>
                      {/* Download */}
                      <button
                        onClick={() => handleDownload(file.id, file.originalname)}
                        className="bg-green-500 text-white px-3 py-1 rounded hover:bg-green-600"
                      >
                        Download
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Login form (default)
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100 dark:bg-gray-900">
      {/* Login form container: light bg with dark text , dark mode contrast - JSX comment */}
      <div className="bg-white dark:bg-gray-800 p-8 rounded shadow-md w-full max-w-md">
        <h1 className="text-2xl font-bold mb-6 text-center text-gray-900 dark:text-gray-100">Login to Free Storage Manager</h1>
        <form onSubmit={handleLogin}>
          <div className="mb-4">
            <label className="block text-gray-700 dark:text-gray-300">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2 border rounded border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              required
            />
          </div>
          <div className="mb-4">
            <label className="block text-gray-700 dark:text-gray-300">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border rounded border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              required
            />
          </div>
          <button
            type="submit"
            className="w-full bg-blue-500 text-white py-2 rounded hover:bg-blue-600"
          >
            Login
          </button>
        </form>
        {message && <p className="mt-4 text-center text-red-500">{message}</p>}
        <p className="mt-4 text-sm text-gray-600 dark:text-gray-400 text-center">
          Demo: username=admin , password=password
        </p>
      </div>
    </div>
  );
}
