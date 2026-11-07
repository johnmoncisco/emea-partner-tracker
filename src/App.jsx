import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  signInWithCustomToken, 
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  onSnapshot, 
  setDoc 
} from 'firebase/firestore';
import { 
  CheckCircle2, 
  Circle, 
  Search, 
  Download, 
  Upload, 
  RefreshCw, 
  Globe, 
  ChevronDown, 
  ChevronUp, 
  LayoutGrid, 
  Database, 
  TrendingUp, 
  CheckSquare, 
  FileText, 
  Save, 
  AlertCircle,
  Users,
  Building2,
  Briefcase,
  Wrench,
  X
} from 'lucide-react';

// Initialize Firebase using environment configs or standard fallbacks
const firebaseConfig = typeof __firebase_config !== 'undefined' 
  ? JSON.parse(__firebase_config) 
  : {
      apiKey: "demo-api-key",
      authDomain: "demo-app.firebaseapp.com",
      projectId: "demo-app",
      storageBucket: "demo-app.appspot.com",
      messagingSenderId: "123456789",
      appId: "1:123456789:web:demo"
    };

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'regional-partner-tracker';

// Regions metadata along with allocated personnel extracted from EMEA BoM spreadsheet
const REGIONS = [
  { 
    id: 'uki', 
    name: 'UKI', 
    flag: '🇬🇧',
    ciscoTech: ['John Monaghan', 'Andrew Reeves'],
    panduitTech: ['Michael Akinla', 'Simon Robinson'],
    ciscoSales: ['Alastair Tucker-Brown'],
    panduitSales: ['Abi Atkins']
  },
  { 
    id: 'spain_portugal', 
    name: 'Spain / Portugal', 
    flag: '🇪🇸',
    ciscoTech: ['Jessica Paez Bonilla', 'Simon Ovsyannikov'],
    panduitTech: ['Neyton Avila'],
    ciscoSales: ['Lara Fernandes'],
    panduitSales: ['Juan Carlos Hernández']
  },
  { 
    id: 'italy', 
    name: 'Italy', 
    flag: '🇮🇹',
    ciscoTech: ['Jessica Paez Bonilla', 'John Monaghan'],
    panduitTech: ['Daniel Tordin'],
    ciscoSales: ['Francesco Piccoli'],
    panduitSales: ['Gianmarco Griffini', 'Jorge Neyton Avila Pacheco']
  },
  { 
    id: 'germany', 
    name: 'Germany', 
    flag: '🇩🇪',
    ciscoTech: ['John Monaghan'],
    panduitTech: ['TBC'],
    ciscoSales: ['Odd Erik Kalloekken'],
    panduitSales: ['Stefan Fammler']
  },
  { 
    id: 'belux', 
    name: 'BeLUX', 
    flag: '🇧🇪',
    ciscoTech: ['TBC'],
    panduitTech: ['Eli Demey'],
    ciscoSales: ['Odd Erik Kalloekken'],
    panduitSales: ['Gregoire Baudoin', 'Eli Demey']
  },
  { 
    id: 'norway', 
    name: 'Norway', 
    flag: '🇳🇴',
    ciscoTech: ['John Monaghan', 'Erik Midthun'],
    panduitTech: ['Michael Akinla'],
    ciscoSales: ['Alastair Tucker-Brown', 'Erik Kalloekken'],
    panduitSales: ['Valerie McHugh']
  },
  { 
    id: 'middle_east', 
    name: 'Middle East', 
    flag: '🇦🇪',
    ciscoTech: ['Nilesh Halai', 'John Monaghan'],
    panduitTech: ['Salim Janbeh', 'Mohamed Abdelrahman'],
    ciscoSales: ['Nilesh Halai'],
    panduitSales: ['Abdul Halim', 'Jorge Neyton Avila Pacheco']
  }
];

const TASK_DEFINITIONS = [
  { id: 'cisco_panduit', label: 'Connected with Cisco/Panduit peer?' },
  { id: 'identified_partners', label: 'Identified potential Partners?' },
  { id: 'workshop_planned', label: 'Workshop planned with Partners?' },
  { id: 'accessed_materials', label: 'Accessed learning and demo materials?' },
  { id: 'opportunities_captured', label: 'Opportunities captured?' }
];

// Generate initial empty task structure
const createInitialState = () => {
  const initialData = {};
  REGIONS.forEach(region => {
    initialData[region.id] = {};
    TASK_DEFINITIONS.forEach(task => {
      initialData[region.id][task.id] = {
        completed: false,
        notes: ''
      };
    });
  });
  return initialData;
};

export default function RegionalPartnerTracker() {
  const [user, setUser] = useState(null);
  const [trackerData, setTrackerData] = useState(createInitialState());
  const [activeTab, setActiveTab] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [collapsedRegions, setCollapsedRegions] = useState({});
  const [saveStatus, setSaveStatus] = useState('synced'); // 'synced', 'saving', 'error'
  const [lastSaved, setLastSaved] = useState(null);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importJsonText, setImportJsonText] = useState('');
  const [importError, setImportError] = useState('');

  // 1. Authenticate user securely using Firebase custom token or anonymous login
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Firebase authentication error:", err);
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  // 2. Real-time Firebase Firestore Sync
  useEffect(() => {
    if (!user) return;

    const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'trackerState', 'globalConfig');

    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const cloudData = docSnap.data().regionsData;
        if (cloudData) {
          setTrackerData(prev => {
            const merged = createInitialState();
            REGIONS.forEach(r => {
              if (cloudData[r.id]) {
                TASK_DEFINITIONS.forEach(t => {
                  if (cloudData[r.id][t.id]) {
                    merged[r.id][t.id] = {
                      completed: !!cloudData[r.id][t.id].completed,
                      notes: cloudData[r.id][t.id].notes || ''
                    };
                  }
                });
              }
            });
            return merged;
          });
        }
      }
      setSaveStatus('synced');
    }, (error) => {
      console.error("Firestore snapshot error:", error);
      setSaveStatus('error');
    });

    return () => unsubscribe();
  }, [user]);

  // Persist state updates to Cloud Firestore
  const saveToFirebase = async (newData) => {
    if (!user) return;
    setSaveStatus('saving');
    try {
      const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'trackerState', 'globalConfig');
      await setDoc(docRef, {
        regionsData: newData,
        lastUpdated: new Date().toISOString(),
        updatedBy: user.uid
      }, { merge: true });
      setSaveStatus('synced');
      setLastSaved(new Date());
    } catch (err) {
      console.error("Error writing data to Firestore:", err);
      setSaveStatus('error');
    }
  };

  // Checkbox toggle handler
  const handleCheckboxChange = (regionId, taskId, value) => {
    const updated = {
      ...trackerData,
      [regionId]: {
        ...trackerData[regionId],
        [taskId]: {
          ...trackerData[regionId][taskId],
          completed: value
        }
      }
    };
    setTrackerData(updated);
    saveToFirebase(updated);
  };

  // Text notes change handler
  const handleNotesChange = (regionId, taskId, value) => {
    const updated = {
      ...trackerData,
      [regionId]: {
        ...trackerData[regionId],
        [taskId]: {
          ...trackerData[regionId][taskId],
          notes: value
        }
      }
    };
    setTrackerData(updated);
    saveToFirebase(updated);
  };

  const toggleCollapse = (regionId) => {
    setCollapsedRegions(prev => ({ ...prev, [regionId]: !prev[regionId] }));
  };

  // Dashboard calculation stats
  const stats = useMemo(() => {
    let totalTasks = 0;
    let completedTasks = 0;
    const regionStats = {};

    REGIONS.forEach(region => {
      let rCompleted = 0;
      TASK_DEFINITIONS.forEach(task => {
        totalTasks++;
        if (trackerData[region.id]?.[task.id]?.completed) {
          completedTasks++;
          rCompleted++;
        }
      });
      const pct = Math.round((rCompleted / TASK_DEFINITIONS.length) * 100);
      regionStats[region.id] = {
        completed: rCompleted,
        total: TASK_DEFINITIONS.length,
        percentage: pct
      };
    });

    const overallPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    return {
      totalTasks,
      completedTasks,
      overallPct,
      regionStats
    };
  }, [trackerData]);

  // Filter regions based on active tab and search query
  const visibleRegions = useMemo(() => {
    return REGIONS.filter(region => {
      // Filter by region tab
      if (activeTab !== 'all' && region.id !== activeTab) return false;

      // Filter by search query across region name, allocated people, and notes
      if (!searchQuery.trim()) return true;
      const query = searchQuery.toLowerCase();

      const nameMatch = region.name.toLowerCase().includes(query);
      if (nameMatch) return true;

      const people = [
        ...region.ciscoTech,
        ...region.panduitTech,
        ...region.ciscoSales,
        ...region.panduitSales
      ].join(' ').toLowerCase();
      if (people.includes(query)) return true;

      const tasks = trackerData[region.id] || {};
      const notesMatch = TASK_DEFINITIONS.some(task => {
        const note = tasks[task.id]?.notes || '';
        const taskLabel = task.label.toLowerCase();
        return note.toLowerCase().includes(query) || taskLabel.includes(query);
      });

      return notesMatch;
    });
  }, [activeTab, searchQuery, trackerData]);

  // Data Export - JSON
  const handleExportJSON = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(trackerData, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `regional_partner_tracker_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // Data Export - CSV
  const handleExportCSV = () => {
    let csvContent = "data:text/csv;charset=utf-8,Region,Task,Completed,Notes,Cisco Tech,Panduit Tech,Cisco Sales,Panduit Sales\n";

    REGIONS.forEach(region => {
      TASK_DEFINITIONS.forEach(task => {
        const taskState = trackerData[region.id]?.[task.id] || { completed: false, notes: '' };
        const cleanNotes = `"${(taskState.notes || '').replace(/"/g, '""')}"`;
        const cTech = `"${region.ciscoTech.join(', ')}"`;
        const pTech = `"${region.panduitTech.join(', ')}"`;
        const cSales = `"${region.ciscoSales.join(', ')}"`;
        const pSales = `"${region.panduitSales.join(', ')}"`;
        
        const row = `"${region.name}","${task.label}",${taskState.completed ? 'YES' : 'NO'},${cleanNotes},${cTech},${pTech},${cSales},${pSales}`;
        csvContent += row + "\n";
      });
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `emea_partner_tracking_report_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  // Data Import - JSON
  const handleImportJSON = () => {
    setImportError('');
    try {
      const parsed = JSON.parse(importJsonText);
      if (typeof parsed !== 'object' || parsed === null) {
        throw new Error("Invalid JSON format");
      }
      
      const updated = createInitialState();
      REGIONS.forEach(r => {
        if (parsed[r.id]) {
          TASK_DEFINITIONS.forEach(t => {
            if (parsed[r.id][t.id]) {
              updated[r.id][t.id] = {
                completed: !!parsed[r.id][t.id].completed,
                notes: parsed[r.id][t.id].notes || ''
              };
            }
          });
        }
      });

      setTrackerData(updated);
      saveToFirebase(updated);
      setImportModalOpen(false);
      setImportJsonText('');
    } catch (err) {
      setImportError("Failed to parse JSON file. Ensure correct schema format.");
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans antialiased">
      {/* Top Header Bar */}
      <header className="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-30 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            
            {/* Title & Brand */}
            <div className="flex items-center space-x-3">
              <div className="p-2.5 bg-indigo-600 rounded-xl shadow-inner">
                <Globe className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">EMEA Regional Partner Management Tracker</h1>
                <p className="text-xs text-slate-400">Cisco & Panduit Alliance Task Execution & Team Allocations</p>
              </div>
            </div>

            {/* Sync Badge & Actions */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center space-x-2 px-3 py-1.5 bg-slate-800 rounded-full border border-slate-700 text-xs">
                {saveStatus === 'saving' && (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 text-amber-400 animate-spin" />
                    <span className="text-amber-300 font-medium">Syncing...</span>
                  </>
                )}
                {saveStatus === 'synced' && (
                  <>
                    <Database className="h-3.5 w-3.5 text-emerald-400" />
                    <span className="text-slate-300 font-medium">
                      Cloud Synced {lastSaved ? `(${lastSaved.toLocaleTimeString()})` : ''}
                    </span>
                  </>
                )}
                {saveStatus === 'error' && (
                  <>
                    <AlertCircle className="h-3.5 w-3.5 text-rose-400" />
                    <span className="text-rose-300 font-medium">Sync Error</span>
                  </>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleExportCSV}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-xs font-semibold text-slate-200 transition-colors"
                  title="Export tracking status to CSV"
                >
                  <Download className="h-3.5 w-3.5 text-indigo-400" />
                  CSV
                </button>
                <button
                  onClick={handleExportJSON}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-xs font-semibold text-slate-200 transition-colors"
                  title="Backup state as JSON"
                >
                  <Save className="h-3.5 w-3.5 text-emerald-400" />
                  JSON
                </button>
                <button
                  onClick={() => setImportModalOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition-colors shadow-sm"
                >
                  <Upload className="h-3.5 w-3.5" />
                  Restore
                </button>
              </div>
            </div>

          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        
        {/* Metric Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Overall Completion</p>
              <p className="text-3xl font-extrabold text-slate-900 mt-1">{stats.overallPct}%</p>
              <p className="text-xs text-slate-500 mt-1">{stats.completedTasks} of {stats.totalTasks} Tasks Completed</p>
            </div>
            <div className="p-3 bg-indigo-50 rounded-xl">
              <TrendingUp className="h-8 w-8 text-indigo-600" />
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Tracked Regions</p>
              <p className="text-3xl font-extrabold text-slate-900 mt-1">{REGIONS.length}</p>
              <p className="text-xs text-slate-500 mt-1">Europe & Middle East</p>
            </div>
            <div className="p-3 bg-blue-50 rounded-xl">
              <Building2 className="h-8 w-8 text-blue-600" />
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Fully Done Regions</p>
              <p className="text-3xl font-extrabold text-slate-900 mt-1">
                {Object.values(stats.regionStats).filter(r => r.percentage === 100).length} / {REGIONS.length}
              </p>
              <p className="text-xs text-slate-500 mt-1">All 4 tasks completed</p>
            </div>
            <div className="p-3 bg-emerald-50 rounded-xl">
              <CheckSquare className="h-8 w-8 text-emerald-600" />
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-center">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Total EMEA Progress</span>
              <span className="text-sm font-bold text-indigo-600">{stats.overallPct}%</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden border border-slate-200">
              <div 
                className="bg-indigo-600 h-full rounded-full transition-all duration-500 ease-out" 
                style={{ width: `${stats.overallPct}%` }}
              />
            </div>
            <span className="text-[11px] text-slate-400 mt-2">Central Firestore real-time state</span>
          </div>

        </div>

        {/* Filters and Navigation */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            
            {/* Region Tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-2 md:pb-0 scrollbar-thin">
              <button
                onClick={() => setActiveTab('all')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                  activeTab === 'all'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                All Regions ({REGIONS.length})
              </button>
              
              {REGIONS.map(region => {
                const rStat = stats.regionStats[region.id];
                return (
                  <button
                    key={region.id}
                    onClick={() => setActiveTab(region.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                      activeTab === region.id
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    <span>{region.flag}</span>
                    <span>{region.name}</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                      activeTab === region.id ? 'bg-indigo-700 text-indigo-100' : 'bg-slate-200 text-slate-700'
                    }`}>
                      {rStat.completed}/5
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Search Filter */}
            <div className="relative min-w-[260px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search regions, contacts, or notes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-8 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

          </div>
        </div>

        {/* Region Content Cards */}
        {visibleRegions.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
            <Search className="h-10 w-10 text-slate-300 mx-auto mb-3" />
            <h3 className="text-sm font-semibold text-slate-700">No matching region, contact, or note found</h3>
            <p className="text-xs text-slate-500 mt-1">Try clearing your search query or switching region tabs.</p>
            <button
              onClick={() => { setSearchQuery(''); setActiveTab('all'); }}
              className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-500"
            >
              Clear Filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6">
            {visibleRegions.map(region => {
              const rStat = stats.regionStats[region.id];
              const isCollapsed = collapsedRegions[region.id];
              const regionTasks = trackerData[region.id] || {};

              return (
                <div 
                  key={region.id} 
                  className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden transition-all duration-200 hover:border-slate-300"
                >
                  {/* Card Header */}
                  <div 
                    onClick={() => toggleCollapse(region.id)}
                    className="p-4 sm:p-5 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer hover:bg-slate-100/80 transition-colors"
                  >
                    <div className="flex items-center space-x-3">
                      <span className="text-2xl">{region.flag}</span>
                      <div>
                        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                          {region.name}
                        </h2>
                        <p className="text-xs text-slate-500">
                          {rStat.completed} of {rStat.total} Action Tasks Completed
                        </p>
                      </div>
                    </div>

                    {/* Progress Bar & Accordion Control */}
                    <div className="flex items-center space-x-4">
                      <div className="w-32 sm:w-44 flex items-center gap-2">
                        <div className="flex-1 bg-slate-200 rounded-full h-2.5 overflow-hidden">
                          <div 
                            className={`h-full rounded-full transition-all duration-300 ${
                              rStat.percentage === 100 ? 'bg-emerald-500' : 'bg-indigo-600'
                            }`}
                            style={{ width: `${rStat.percentage}%` }}
                          />
                        </div>
                        <span className="text-xs font-bold text-slate-700 min-w-[32px] text-right">
                          {rStat.percentage}%
                        </span>
                      </div>

                      <button 
                        className="p-1 rounded text-slate-400 hover:text-slate-600"
                        aria-label="Toggle section"
                      >
                        {isCollapsed ? <ChevronDown className="h-5 w-5" /> : <ChevronUp className="h-5 w-5" />}
                      </button>
                    </div>
                  </div>

                  {/* Body Content */}
                  {!isCollapsed && (
                    <div className="p-4 sm:p-6 space-y-6">
                      
                      {/* Allocated Personnel Grid */}
                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="space-y-1">
                          <div className="flex items-center space-x-1.5 text-xs font-bold text-blue-700 uppercase tracking-wider">
                            <Wrench className="h-3.5 w-3.5" />
                            <span>Cisco Technical</span>
                          </div>
                          <p className="text-xs font-semibold text-slate-700">
                            {region.ciscoTech.join(', ')}
                          </p>
                        </div>

                        <div className="space-y-1">
                          <div className="flex items-center space-x-1.5 text-xs font-bold text-emerald-700 uppercase tracking-wider">
                            <Wrench className="h-3.5 w-3.5" />
                            <span>Panduit Technical</span>
                          </div>
                          <p className="text-xs font-semibold text-slate-700">
                            {region.panduitTech.join(', ')}
                          </p>
                        </div>

                        <div className="space-y-1">
                          <div className="flex items-center space-x-1.5 text-xs font-bold text-indigo-700 uppercase tracking-wider">
                            <Briefcase className="h-3.5 w-3.5" />
                            <span>Cisco Sales</span>
                          </div>
                          <p className="text-xs font-semibold text-slate-700">
                            {region.ciscoSales.join(', ')}
                          </p>
                        </div>

                        <div className="space-y-1">
                          <div className="flex items-center space-x-1.5 text-xs font-bold text-purple-700 uppercase tracking-wider">
                            <Briefcase className="h-3.5 w-3.5" />
                            <span>Panduit Sales</span>
                          </div>
                          <p className="text-xs font-semibold text-slate-700">
                            {region.panduitSales.join(', ')}
                          </p>
                        </div>
                      </div>

                      {/* Tasks List */}
                      <div className="divide-y divide-slate-100 space-y-6 sm:space-y-0 border-t border-slate-100 pt-4">
                        {TASK_DEFINITIONS.map((task, idx) => {
                          const taskState = regionTasks[task.id] || { completed: false, notes: '' };

                          return (
                            <div 
                              key={task.id} 
                              className={`py-4 first:pt-0 last:pb-0 grid grid-cols-1 lg:grid-cols-12 gap-4 items-start ${
                                idx !== 0 ? 'sm:border-t sm:border-slate-100' : ''
                              }`}
                            >
                              
                              {/* Task Checkbox & Title */}
                              <div className="lg:col-span-5 flex items-start space-x-3 pt-1">
                                <button
                                  type="button"
                                  onClick={() => handleCheckboxChange(region.id, task.id, !taskState.completed)}
                                  className="mt-0.5 focus:outline-none group flex-shrink-0"
                                >
                                  {taskState.completed ? (
                                    <CheckCircle2 className="h-5 w-5 text-emerald-600 fill-emerald-50 group-hover:text-emerald-700 transition-colors" />
                                  ) : (
                                    <Circle className="h-5 w-5 text-slate-300 group-hover:text-indigo-500 transition-colors" />
                                  )}
                                </button>
                                
                                <label 
                                  onClick={() => handleCheckboxChange(region.id, task.id, !taskState.completed)}
                                  className={`text-sm font-semibold cursor-pointer select-none transition-colors ${
                                    taskState.completed ? 'text-slate-900 line-through text-slate-500' : 'text-slate-800'
                                  }`}
                                >
                                  {task.label}
                                </label>
                              </div>

                              {/* Freeform Notes Field */}
                              <div className="lg:col-span-7">
                                <div className="relative">
                                  <FileText className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                                  <textarea
                                    rows={2}
                                    placeholder={`Add notes for ${task.label.toLowerCase()}...`}
                                    value={taskState.notes || ''}
                                    onChange={(e) => handleNotesChange(region.id, task.id, e.target.value)}
                                    className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white resize-y transition-colors"
                                  />
                                </div>
                              </div>

                            </div>
                          );
                        })}
                      </div>

                    </div>
                  )}

                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Restore JSON Backup Modal */}
      {importModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xl max-w-lg w-full p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Upload className="h-5 w-5 text-indigo-600" />
              Restore State from JSON Backup
            </h3>
            
            <p className="text-xs text-slate-500">
              Paste your previously exported JSON dataset below to restore or overwrite central tracking status.
            </p>

            {importError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-xs">
                {importError}
              </div>
            )}

            <textarea
              rows={6}
              value={importJsonText}
              onChange={(e) => setImportJsonText(e.target.value)}
              placeholder="Paste JSON content here..."
              className="w-full p-3 font-mono text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => { setImportModalOpen(false); setImportError(''); }}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleImportJSON}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold"
              >
                Apply & Save to Cloud
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 border-t border-slate-200 mt-12 text-center">
        <p className="text-xs text-slate-400">
          EMEA Regional Partner Management System • Synchronized Central Firebase Storage
        </p>
      </footer>
    </div>
  );
}