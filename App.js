import React, { useState, useMemo, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  SafeAreaView,
  Platform,
  Dimensions
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// --- IMPORT FIRESTORE & AUTH CORE ---
import { db, auth } from './firebaseConfig';
import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  addDoc, 
  deleteDoc, 
  query, 
  orderBy, 
  onSnapshot 
} from 'firebase/firestore';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  onAuthStateChanged, 
  signOut 
} from 'firebase/auth';

// --- INITIAL CONSTANTS & SCHEMAS ---
const INITIAL_CATEGORIES = [
  { id: '1', name: 'Dining & Groceries', icon: 'restaurant-outline', color: '#FF6B6B', type: 'expense', class: 'variable' },
  { id: '2', name: 'Rent', icon: 'home-outline', color: '#4DABF7', type: 'expense', class: 'fixed' },
  { id: '3', name: 'Transport', icon: 'car-outline', color: '#FCC419', type: 'expense', class: 'fixed' },
  { id: '4', name: 'Shopping', icon: 'bag-handle-outline', color: '#DA77F2', type: 'expense', class: 'variable' },
  { id: '5', name: 'Travel', icon: 'airplane-outline', color: '#38BDF8', type: 'expense', class: 'variable' },
  { id: '6', name: 'Other', icon: 'ellipsis-horizontal-outline', color: '#A0AEC0', type: 'expense', class: 'variable' },
  { id: '7', name: 'Salary', icon: 'cash-outline', color: '#10B981', type: 'income', class: 'income' },
  { id: '8', name: 'Freelance', icon: 'laptop-outline', color: '#12B886', type: 'income', class: 'income' },
];

const TARGETS = { income: 7650, fixed: 2750, variable: 1300, savings: 3600 };
const DEFAULT_BUDGETS = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0, '6': 0 };

export default function App() {
  // Authentication State
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [authError, setAuthError] = useState('');

  // App Layout States
  const [activeTab, setActiveTab] = useState('home');
  const [transactions, setTransactions] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [budgets, setBudgets] = useState(DEFAULT_BUDGETS);

  const currentSystemMonth = '2026-06';
  const [selectedMonth, setSelectedMonth] = useState('2026-06');
  const [sortBy, setSortBy] = useState('all');

  // Modal Controllers
  const [modalVisible, setModalVisible] = useState(false);
  const [budgetModalVisible, setBudgetModalVisible] = useState(false);
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [historyMenuVisible, setHistoryMenuVisible] = useState(false);
  const [subModalVisible, setSubModalVisible] = useState(false);

  // Form Processing Buffers
  const [editingTxId, setEditingTxId] = useState(null);
  const [focusedBudgetId, setFocusedBudgetId] = useState(null);
  const [newBudgetLimit, setNewBudgetLimit] = useState('');
  const [amount, setAmount] = useState('');
  const [type, setType] = useState('expense');
  const [selectedCategory, setSelectedCategory] = useState(INITIAL_CATEGORIES[0].id);
  const [description, setDescription] = useState('');
  const [txDate, setTxDate] = useState('');

  // Subscriptions Modal Buffer
  const [newSubDesc, setNewSubDesc] = useState('');
  const [newSubAmount, setNewSubAmount] = useState('');
  const [newSubCat, setNewSubCat] = useState('1');

  // Calendar Parameters
  const [calendarYear, setCalendarYear] = useState(2026);
  const [calendarMonth, setCalendarMonth] = useState(5);
  const [dimensions, setDimensions] = useState(Dimensions.get('window'));

  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', ({ window }) => {
      setDimensions(window);
    });
    return () => subscription?.remove();
  }, []);

  const isDesktopLayout = Platform.OS === 'web' && dimensions.width > 768;

  // --- AUTH RUNTIME LISTENER ---
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });
    return unsubscribeAuth;
  }, []);

  // --- SECURE FIRESTORE SYNC (USER ARCHITECTURE SANDBOX) ---
  useEffect(() => {
    if (!user) return;

    // Stream user-specific transactions
    const txQuery = query(collection(db, "users", user.uid, "transactions"), orderBy("date", "desc"));
    const unsubscribeTx = onSnapshot(txQuery, (snapshot) => {
      const txList = [];
      snapshot.forEach((doc) => { txList.push({ id: doc.id, ...doc.data() }); });
      setTransactions(txList);
    });

    // Stream user-specific subscriptions
    const subQuery = query(collection(db, "users", user.uid, "subscriptions"));
    const unsubscribeSubs = onSnapshot(subQuery, (snapshot) => {
      const subList = [];
      snapshot.forEach((doc) => { subList.push({ id: doc.id, ...doc.data() }); });
      setSubscriptions(subList);
    });

    // Fetch user-specific budgets configuration card
    const fetchBudgets = async () => {
      const budgetDocRef = doc(db, "users", user.uid, "configs", "budget_limits");
      const budgetSnap = await getDoc(budgetDocRef);
      if (budgetSnap.exists()) setBudgets(budgetSnap.data());
    };
    fetchBudgets();

    return () => {
      unsubscribeTx();
      unsubscribeSubs();
    };
  }, [user]);

  // --- AUTOMATED RECURRING ENGINE PIPELINE ---
  useEffect(() => {
    if (!user || subscriptions.length === 0 || selectedMonth === '2026') return;

    const generatedKeysForThisMonth = new Set(
      transactions
        .filter(t => t.date && t.date.startsWith(selectedMonth) && t.subscriptionBlueprintId)
        .map(t => t.subscriptionBlueprintId)
    );
    const pendingInjections = subscriptions.filter(sub => !generatedKeysForThisMonth.has(sub.id));

    if (pendingInjections.length > 0) {
      pendingInjections.forEach(async (sub) => {
        await addDoc(collection(db, "users", user.uid, "transactions"), {
          amount: sub.amount,
          type: sub.type,
          categoryId: sub.categoryId,
          date: `${selectedMonth}-01`,
          description: `🔄 ${sub.description}`,
          subscriptionBlueprintId: sub.id
        });
      });
    }
  }, [subscriptions, selectedMonth, transactions, user]);

  // --- AUTHENTICATION ACTIONS ---
  const handleAuthAction = async () => {
    setAuthError('');
    if (!email || !password) return setAuthError('All fields required.');
    try {
      if (isRegistering) {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err) {
      setAuthError(err.message.replace('Firebase: ', ''));
    }
  };

  const handleSignOut = () => signOut(auth);

  // --- ANALYTICS ENGINES ---
  const monthMetrics = useMemo(() => {
    let scopedTx = transactions.filter(t => t.date && t.date.startsWith(selectedMonth));
    let income = 0; let expense = 0; let fixedTotal = 0; let variableTotal = 0;
    const catTotals = {};
    INITIAL_CATEGORIES.forEach(c => { catTotals[c.id] = 0; });

    scopedTx.forEach(t => {
      catTotals[t.categoryId] = (catTotals[t.categoryId] || 0) + t.amount;
      const cat = INITIAL_CATEGORIES.find(c => c.id === t.categoryId);
      if (t.type === 'income') { income += t.amount; } 
      else {
        expense += t.amount;
        if (cat?.class === 'fixed') fixedTotal += t.amount;
        if (cat?.class === 'variable') variableTotal += t.amount;
      }
    });

    const netSaved = income - expense;
    return {
      transactions: scopedTx, income, expense, balance: netSaved,
      savingsRate: income > 0 ? (netSaved / income) * 100 : 0,
      fixedTotal, variableTotal, catTotals,
      targetBenchmarks: { income: TARGETS.income, fixed: TARGETS.fixed, variable: TARGETS.variable }
    };
  }, [transactions, selectedMonth, sortBy]);

  const bankInsights = useMemo(() => {
    const alerts = [];
    const recurringCommitments = subscriptions.reduce((acc, s) => acc + s.amount, 0);
    if (monthMetrics.income > 0 && recurringCommitments > monthMetrics.income * 0.15) {
      alerts.push({ type: 'warning', title: 'High Subscription Footprint', desc: 'Recurring bills cross safety margins.' });
    }
    if (monthMetrics.savingsRate > 35) {
      alerts.push({ type: 'success', title: 'Elite Capital Velocity', desc: 'Active savings curves are clean.' });
    }
    return alerts;
  }, [monthMetrics, subscriptions]);

  const uniqueMonths = useMemo(() => {
    const monthsSet = new Set(transactions.map(t => t.date ? t.date.substring(0, 7) : currentSystemMonth));
    return ['2026', ...Array.from(monthsSet).sort().reverse()];
  }, [transactions]);

  const daysInMonthMatrix = useMemo(() => {
    const startDayOfWeek = new Date(calendarYear, calendarMonth, 1).getDay();
    const totalDays = new Date(calendarYear, calendarMonth + 1, 0).getDate();
    const grid = [];
    for (let i = 0; i < startDayOfWeek; i++) grid.push(null);
    for (let day = 1; day <= totalDays; day++) grid.push(day);
    return grid;
  }, [calendarYear, calendarMonth]);

  const changeCalendarMonth = (dir) => {
    let newM = calendarMonth + dir; let newY = calendarYear;
    if (newM > 11) { newM = 0; newY += 1; } if (newM < 0) { newM = 11; newY -= 1; }
    setCalendarMonth(newM); setCalendarYear(newY);
  };

  const cleanInputToFloat = (val) => {
    if (!val) return 0;
    const parsed = parseFloat(val.replace(/[\$,\s]/g, ''));
    return isNaN(parsed) ? 0 : parsed;
  };

  // --- DATA MUTATION WRITE ACTIONS ---
  const handleSaveTransaction = async () => {
    if (!user) return;
    const parsedAmount = cleanInputToFloat(amount);
    if (parsedAmount <= 0) return;
    const payload = {
      amount: parsedAmount, type, categoryId: selectedCategory,
      date: txDate.trim() || new Date().toISOString().split('T')[0],
      description: description.trim() || INITIAL_CATEGORIES.find(c => c.id === selectedCategory)?.name
    };
    if (editingTxId) {
      await setDoc(doc(db, "users", user.uid, "transactions", editingTxId), payload, { merge: true });
    } else {
      await addDoc(collection(db, "users", user.uid, "transactions"), payload);
    }
    setModalVisible(false); setEditingTxId(null);
  };

  const handleUpdateBudget = async () => {
    if (!user) return;
    const updatedBudgets = { ...budgets, [focusedBudgetId]: cleanInputToFloat(newBudgetLimit) };
    setBudgets(updatedBudgets);
    await setDoc(doc(db, "users", user.uid, "configs", "budget_limits"), updatedBudgets);
    setBudgetModalVisible(false);
  };

  const handleCreateSubscription = async () => {
    if (!user || !newSubDesc || cleanInputToFloat(newSubAmount) <= 0) return;
    await addDoc(collection(db, "users", user.uid, "subscriptions"), {
      description: newSubDesc, amount: cleanInputToFloat(newSubAmount), categoryId: newSubCat, type: 'expense'
    });
    setSubModalVisible(false); setNewSubDesc(''); setNewSubAmount('');
  };

  const handleDeleteTx = async (id) => await deleteDoc(doc(db, "users", user.uid, "transactions", id));
  const handleDeleteSub = async (id) => await deleteDoc(doc(db, "users", user.uid, "subscriptions", id));
  const formatMonthLabel = (s) => s === '2026' ? 'Full Year 2026' : new Date(parseInt(s.split('-')[0]), parseInt(s.split('-')[1]) - 1, 2).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  // --- RENDERING LOADING AND AUTH TILES ---
  if (authLoading) return <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}><Text style={{ color: '#64748B' }}>Syncing Engine...</Text></View>;

  if (!user) {
    return (
      <SafeAreaView style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <View style={[styles.modalBody, { width: isDesktopLayout ? 380 : '90%', borderRadius: 16, borderTopLeftRadius: 16, borderTopRightRadius: 16 }]}>
          
          <Text style={[styles.contextHeader, { textAlign: 'center', marginBottom: 6 }]}>financial.friend</Text>
          <Text style={{ color: '#64748B', fontSize: 13, textAlign: 'center', marginBottom: 28 }}>
            {isRegistering ? 'Create your personal account' : 'Sign in to your ledger'}
          </Text>
          
          {authError ? (
            <Text style={{ color: '#EF4444', fontSize: 12, marginBottom: 16, textAlign: 'center' }}>{authError}</Text>
          ) : null}
          
          <Text style={{ color: '#94A3B8', fontSize: 11, fontWeight: '700', marginBottom: 6, textTransform: 'uppercase' }}>Email Address</Text>
          <TextInput 
            style={[styles.lineFieldInput, { marginBottom: 20, borderBottomColor: '#1E293B' }]} 
            placeholder="your@email.com" 
            placeholderTextColor="#4A5568" 
            value={email} 
            onChangeText={setEmail} 
            autoCapitalize="none" 
            keyboardType="email-address"
          />
          
          <Text style={{ color: '#94A3B8', fontSize: 11, fontWeight: '700', marginBottom: 6, textTransform: 'uppercase' }}>Password</Text>
          <TextInput 
            style={[styles.lineFieldInput, { marginBottom: 12, borderBottomColor: '#1E293B' }]} 
            placeholder="••••••••" 
            placeholderTextColor="#4A5568" 
            secureTextEntry 
            value={password} 
            onChangeText={setPassword} 
            autoCapitalize="none" 
          />
          
          <TouchableOpacity style={[styles.executeActionBtn, { marginTop: 24 }]} onPress={handleAuthAction}>
            <Text style={styles.executeBtnTxt}>{isRegistering ? 'Sign Up' : 'Log In'}</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={{ marginTop: 20 }} onPress={() => { setIsRegistering(!isRegistering); setAuthError(''); }}>
            <Text style={{ color: '#38BDF8', fontSize: 12, textAlign: 'center', fontWeight: '500' }}>
              {isRegistering ? 'Already have an account? Log in' : "Don't have an account? Sign up"}
            </Text>
          </TouchableOpacity>
          
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* GLOBAL APPLICATION HEADER BAR */}
      <View style={styles.globalHeader}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Text style={styles.brandTitle}>financial.friend</Text>
          <TouchableOpacity onPress={handleSignOut}><Ionicons name="log-out-outline" size={16} color="#64748B" /></TouchableOpacity>
        </View>
        <TouchableOpacity style={styles.headerScopeBadge} onPress={() => setHistoryMenuVisible(true)}>
          <Ionicons name="calendar-outline" size={13} color="#38BDF8" style={{ marginRight: 5 }} />
          <Text style={styles.headerScopeText}>{formatMonthLabel(selectedMonth)}</Text>
          <Ionicons name="chevron-down" size={12} color="#64748B" style={{ marginLeft: 4 }} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={[styles.mainScroll, { width: isDesktopLayout ? 650 : '100%' }]} showsVerticalScrollIndicator={false}>

        {/* TAB 1: OPERATIONAL LEDGER STREAM */}
        {activeTab === 'home' && (
          <View style={styles.viewContainer}>
            <View style={styles.premiumHeroCard}>
              <Text style={styles.heroLabel}>NET OPERATING SURPLUS</Text>
              <Text style={[styles.heroMainValue, { color: monthMetrics.balance >= 0 ? '#10B981' : '#EF4444' }]}>
                ${monthMetrics.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </Text>
              <View style={styles.heroSplitRow}>
                <View style={styles.miniMetricBox}>
                  <Text style={styles.miniLabel}>Gross Yield</Text>
                  <Text style={[styles.miniValue, { color: '#10B981' }]}>+${monthMetrics.income.toLocaleString()}</Text>
                </View>
                <View style={styles.dividerLine} />
                <View style={styles.miniMetricBox}>
                  <Text style={styles.miniLabel}>Total Outflow</Text>
                  <Text style={[styles.miniValue, { color: '#F3F4F6' }]}>-${monthMetrics.expense.toLocaleString()}</Text>
                </View>
              </View>
            </View>

            {bankInsights.length > 0 && (
              <View style={{ gap: 8 }}>
                <Text style={styles.sectionTitle}>Key Intelligence Insights</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingBottom: 4 }}>
                  {bankInsights.map((insight, index) => (
                    <View key={index} style={[styles.insightCard, { borderColor: insight.type === 'danger' ? '#EF4444' : '#10B981' }]}>
                      <Text style={styles.insightTitle}>{insight.title}</Text>
                      <Text style={styles.insightDesc}>{insight.desc}</Text>
                    </View>
                  ))}
                </ScrollView>
              </View>
            )}

            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Ledger Logs</Text>
              <View style={styles.filterPillGroup}>
                {['all', 'income', 'expense'].map((pill) => (
                  <TouchableOpacity key={pill} style={[styles.miniPill, sortBy === pill && styles.miniPillActive]} onPress={() => setSortBy(pill)}>
                    <Text style={[styles.miniPillText, sortBy === pill && styles.miniPillTextActive]}>
                      {pill === 'expense' ? 'Outflows' : pill.charAt(0).toUpperCase() + pill.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {monthMetrics.transactions.length === 0 ? (
              <Text style={styles.emptyStateText}>No entries mapped to this operational timeline scope.</Text>
            ) : (
              monthMetrics.transactions.map(tx => {
                const cat = INITIAL_CATEGORIES.find(c => c.id === tx.categoryId);
                return (
                  <TouchableOpacity key={tx.id} style={styles.txRowCard} onPress={() => {
                    setEditingTxId(tx.id); setAmount(tx.amount.toString()); setDescription(tx.description);
                    setType(tx.type); setTxDate(tx.date); setSelectedCategory(tx.categoryId); setModalVisible(true);
                  }}>
                    <View style={styles.txLeftAlign}>
                      <View style={[styles.txIconBox, { backgroundColor: (cat?.color || '#FFF') + '15' }]}>
                        <Ionicons name={tx.subscriptionBlueprintId ? "sync-outline" : cat?.icon || 'document-text-outline'} size={15} color={cat?.color || '#FFF'} />
                      </View>
                      <View>
                        <Text style={styles.txDescText}>{tx.description}</Text>
                        <Text style={styles.txDateSub}>{tx.date}</Text>
                      </View>
                    </View>
                    <View style={styles.txRightAlign}>
                      <Text style={[styles.txAmountMetric, { color: tx.type === 'income' ? '#10B981' : '#F3F4F6' }]}>
                        {tx.type === 'income' ? '+' : '-'}${tx.amount.toLocaleString()}
                      </Text>
                      <TouchableOpacity style={{ marginLeft: 14 }} onPress={() => handleDeleteTx(tx.id)}>
                        <Ionicons name="trash-outline" size={14} color="#EF4444" />
                      </TouchableOpacity>
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        )}

        {/* TAB 2: EFFICIENCY, CEILINGS & SANKEY DIAGRAM */}
        {activeTab === 'analysis' && (
          <View style={styles.viewContainer}>
            <Text style={styles.sectionTitle}>Ecosystem Financial Sankey Flow</Text>
            <View style={styles.analyticsCard}>
              <View style={styles.sankeyContainer}>
                <View style={styles.sankeyPillar}>
                  <Text style={styles.sankeyNodeHeader}>INFLOW SOURCE</Text>
                  <View style={[styles.sankeyNodeBlock, { backgroundColor: '#10B981', height: 110 }]}>
                    <Text style={styles.sankeyNodeText}>Gross Inflows</Text>
                    <Text style={styles.sankeyNodeValue}>${monthMetrics.income.toLocaleString()}</Text>
                  </View>
                </View>
                <View style={styles.sankeyVectorsColumn}>
                  <Ionicons name="arrow-forward-outline" size={16} color="#475569" style={{ height: 40 }} />
                  <Ionicons name="arrow-forward-outline" size={16} color="#475569" style={{ height: 40 }} />
                  <Ionicons name="arrow-forward-outline" size={16} color="#475569" style={{ height: 40 }} />
                </View>
                <View style={[styles.sankeyPillar, { flex: 1.3 }]}>
                  <Text style={styles.sankeyNodeHeader}>ALLOCATION TARGET</Text>
                  <View style={[styles.sankeyTargetStrip, { borderLeftColor: '#4DABF7' }]}><Text style={styles.sankeyStripLabel}>Fixed Commitments</Text><Text style={styles.sankeyStripValue}>${monthMetrics.fixedTotal.toLocaleString()}</Text></View>
                  <View style={[styles.sankeyTargetStrip, { borderLeftColor: '#DA77F2' }]}><Text style={styles.sankeyStripLabel}>Variable Outlays</Text><Text style={styles.sankeyStripValue}>${monthMetrics.variableTotal.toLocaleString()}</Text></View>
                  <View style={[styles.sankeyTargetStrip, { borderLeftColor: '#10B981', backgroundColor: '#064E3B20' }]}><Text style={[styles.sankeyStripLabel, { color: '#10B981' }]}>Net Vault Reserve</Text><Text style={[styles.sankeyStripValue, { color: '#10B981' }]}>${Math.max(0, monthMetrics.balance).toLocaleString()}</Text></View>
                </View>
              </View>
            </View>

            <Text style={styles.sectionTitle}>Category Ceiling Limits</Text>
            <View style={styles.analyticsCard}>
              {INITIAL_CATEGORIES.filter(c => c.type === 'expense').map(cat => {
                const spent = monthMetrics.catTotals[cat.id] || 0;
                const baseLimit = budgets[cat.id] || 0;
                return (
                  <TouchableOpacity key={cat.id} style={{ marginVertical: 4 }} disabled={selectedMonth === '2026'} onPress={() => { setFocusedBudgetId(cat.id); setNewBudgetLimit(baseLimit > 0 ? baseLimit.toString() : ''); setBudgetModalVisible(true); }}>
                    <View style={styles.bpTopLine}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}><Ionicons name={cat.icon} size={14} color={cat.color} style={{ marginRight: 6 }} /><Text style={styles.bpName}>{cat.name}</Text></View>
                      <Text style={styles.bpNumbers}>${spent.toLocaleString()} <Text style={{ color: '#4A5568', fontWeight: '400' }}>/ ${baseLimit.toLocaleString()}</Text></Text>
                    </View>
                    <View style={styles.bpTrackContainer}><View style={[styles.bpTrackIndicator, { width: `${baseLimit > 0 ? Math.min(spent / baseLimit, 1) * 100 : 0}%`, backgroundColor: spent > baseLimit ? '#EF4444' : cat.color }]} /></View>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.sectionTitle}>Accumulation Runway Projections</Text>
            <View style={styles.analyticsCard}>
              <Text style={{ color: '#94A3B8', fontSize: 13, marginBottom: 12 }}>Based on your live tracking surplus of <Text style={{ color: '#10B981', fontWeight: '700' }}>${monthMetrics.balance.toLocaleString()}</Text> for this active scope:</Text>
              <View style={styles.runwayRow}><View style={styles.runwayPoint}><Text style={styles.runwayTime}>In 1 Cycle</Text><Text style={styles.runwayDesc}>Deficit clearance core balance buffer</Text></View><Text style={styles.runwayValue}>${(monthMetrics.balance * 1).toLocaleString()}</Text></View>
              <View style={styles.runwayRow}><View style={styles.runwayPoint}><Text style={styles.runwayTime}>In 6 Cycles</Text><Text style={styles.runwayDesc}>Core Emergency Base Funding runway</Text></View><Text style={styles.runwayValue}>${(monthMetrics.balance * 6).toLocaleString()}</Text></View>
              <View style={styles.runwayRow}><View style={styles.runwayPoint}><Text style={styles.runwayTime}>In 1 Year</Text><Text style={styles.runwayDesc}>Aggressive Wealth Accumulation Yield</Text></View><Text style={[styles.runwayValue, { color: '#38BDF8' }]}>${(monthMetrics.balance * 12).toLocaleString()}</Text></View>
            </View>
          </View>
        )}

        {/* TAB 3: SUBSCRIPTION BLUEPRINT CONFIGURATOR */}
        {activeTab === 'history' && (
          <View style={styles.viewContainer}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.contextHeader}>Subscription Infrastructure</Text>
              <TouchableOpacity style={styles.actionHeaderPill} onPress={() => setSubModalVisible(true)}><Text style={styles.actionHeaderPillText}>+ Track Bill</Text></TouchableOpacity>
            </View>
            <Text style={{ color: '#64748B', fontSize: 13, marginTop: -10, marginBottom: 6 }}>These blueprints automatically clone themselves into your active streaming transaction ledger pipelines at the launch of each billing sequence cycle.</Text>
            {subscriptions.length === 0 ? ( <Text style={styles.emptyStateText}>No active structural subscriptions tracked inside framework profiles.</Text> ) : (
              subscriptions.map(sub => {
                const cat = INITIAL_CATEGORIES.find(c => c.id === sub.categoryId);
                return (
                  <View key={sub.id} style={styles.txRowCard}>
                    <View style={styles.txLeftAlign}>
                      <View style={[styles.txIconBox, { backgroundColor: '#1E293B' }]}><Ionicons name="sync-outline" size={16} color="#38BDF8" /></View>
                      <View><Text style={styles.txDescText}>{sub.description}</Text><Text style={styles.txDateSub}>{cat?.name || 'Unassigned Category'}</Text></View>
                    </View>
                    <View style={styles.txRightAlign}>
                      <Text style={[styles.txAmountMetric, { color: '#FF6B6B' }]}>-${sub.amount.toFixed(2)}/mo</Text>
                      <TouchableOpacity style={{ marginLeft: 14 }} onPress={() => handleDeleteSub(sub.id)}><Ionicons name="trash-outline" size={14} color="#EF4444" /></TouchableOpacity>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        )}
      </ScrollView>

      {/* FLOATING ACTION ENTRY ATTACHER BUTTON */}
      <TouchableOpacity style={styles.fabTrigger} onPress={() => { setEditingTxId(null); setAmount(''); setDescription(''); setType('expense'); setTxDate(new Date().toISOString().split('T')[0]); setSelectedCategory(INITIAL_CATEGORIES.find(c => c.type === 'expense')?.id || '1'); setModalVisible(true); }}><Ionicons name="add" size={24} color="#FFF" /></TouchableOpacity>

      {/* CORE NAVIGATION system INTERFACING PROFILE */}
      <View style={styles.tabNavBar}>
        <TouchableOpacity style={styles.tabItem} onPress={() => setActiveTab('home')}><Ionicons name="flash" size={18} color={activeTab === 'home' ? '#38BDF8' : '#64748B'} /><Text style={[styles.tabLabel, activeTab === 'home' && styles.tabLabelActive]}>Stream</Text></TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => setActiveTab('analysis')}><Ionicons name="pie-chart" size={18} color={activeTab === 'analysis' ? '#38BDF8' : '#64748B'} /><Text style={[styles.tabLabel, activeTab === 'analysis' && styles.tabLabelActive]}>Efficiency</Text></TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => setActiveTab('history')}><Ionicons name="refresh-circle" size={20} color={activeTab === 'history' ? '#38BDF8' : '#64748B'} /><Text style={[styles.tabLabel, activeTab === 'history' && styles.tabLabelActive]}>Subscriptions</Text></TouchableOpacity>
      </View>

      {/* MODAL 1: TIMELINE SELECTOR */}
      <Modal animationType="fade" transparent visible={historyMenuVisible} onRequestClose={() => setHistoryMenuVisible(false)}>
        <View style={styles.centeredModalOverlay}>
          <View style={[styles.modalBody, { borderRadius: 16, width: isDesktopLayout ? 420 : '90%' }]}>
            <View style={styles.modalHeaderRow}><Text style={styles.modalTitleText}>Scope Timeline Focus Selector</Text><TouchableOpacity onPress={() => setHistoryMenuVisible(false)}><Ionicons name="close" size={22} color="#64748B" /></TouchableOpacity></View>
            <ScrollView style={{ maxHeight: 250 }}>{uniqueMonths.map(m => (<TouchableOpacity key={m} style={styles.historySelectRow} onPress={() => { setSelectedMonth(m); setHistoryMenuVisible(false); }}><Text style={styles.historySelectName}>{formatMonthLabel(m)}</Text></TouchableOpacity>))}</ScrollView>
          </View>
        </View>
      </Modal>

      {/* MODAL 2: LEDGER ENTRY */}
      <Modal animationType="slide" transparent visible={modalVisible} onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBody, { width: isDesktopLayout ? 500 : '100%' }]}>
            <View style={styles.modalHeaderRow}><Text style={styles.modalTitleText}>{editingTxId ? 'Edit Activity Node' : 'Log Operational Ledger Node'}</Text><TouchableOpacity onPress={() => setModalVisible(false)}><Ionicons name="close" size={24} color="#64748B" /></TouchableOpacity></View>
            <View style={styles.segControlRow}>
              <TouchableOpacity style={[styles.segBtn, type === 'expense' && styles.segBtnActive]} onPress={() => setType('expense')}><Text style={[styles.segTxt, type === 'expense' && styles.segTxtActive]}>Spending</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.segBtn, type === 'income' && styles.segBtnActive]} onPress={() => setType('income')}><Text style={[styles.segTxt, type === 'income' && styles.segTxtActive]}>Inflow</Text></TouchableOpacity>
            </View>
            <TextInput style={styles.massiveInput} placeholder="$0.00" placeholderTextColor="#1E293B" keyboardType="numeric" value={amount} onChangeText={setAmount} />
            <TextInput style={styles.lineFieldInput} placeholder="Description notes tag..." placeholderTextColor="#4A5568" value={description} onChangeText={setDescription} />
            <TouchableOpacity style={styles.dateSelectorToggleRow} onPress={() => setDatePickerVisible(true)}><View style={{ flexDirection: 'row', alignItems: 'center' }}><Ionicons name="calendar-clear-outline" size={16} color="#38BDF8" style={{ marginRight: 10 }} /><Text style={styles.dateToggleText}>Ledger Value Processing Date</Text></View><Text style={styles.dateValueHighlight}>{txDate || 'Select Date'}</Text></TouchableOpacity>
            <View style={styles.chipMatrixRow}>
  {INITIAL_CATEGORIES.filter(c => c.type === type).map(cat => (
    <TouchableOpacity 
      key={cat.id} 
      style={[styles.filterChip, selectedCategory === cat.id && { backgroundColor: cat.color, borderColor: cat.color }]} 
      onPress={() => setSelectedCategory(cat.id)}
    >
      <Text style={[styles.chipLabelText, selectedCategory === cat.id && { color: '#000', fontWeight: '700' }]}>
        {cat.name}
      </Text>
    </TouchableOpacity>
  ))}
</View>
            <TouchableOpacity style={styles.executeActionBtn} onPress={handleSaveTransaction}><Text style={styles.executeBtnTxt}>Execute Sync</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* MODAL 3: GRID EMBEDDED CALENDAR */}
      <Modal animationType="fade" transparent visible={datePickerVisible} onRequestClose={() => setDatePickerVisible(false)}>
        <View style={styles.centeredModalOverlay}>
          <View style={[styles.calendarCardFrame, { width: isDesktopLayout ? 420 : '90%', paddingBottom: 24 }]}>
            <View style={styles.calendarNavHeader}><TouchableOpacity onPress={() => changeCalendarMonth(-1)}><Ionicons name="chevron-back" size={20} color="#38BDF8" /></TouchableOpacity><Text style={{ color: '#FFF', fontSize: 14, fontWeight: '700' }}>{new Date(calendarYear, calendarMonth).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</Text><TouchableOpacity onPress={() => changeCalendarMonth(1)}><Ionicons name="chevron-forward" size={20} color="#38BDF8" /></TouchableOpacity></View>
            <View style={styles.calendarWeekRow}>{['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, idx) => (<Text key={idx} style={styles.calendarWeekHeaderCell}>{day}</Text>))}</View>
            <View style={styles.calendarGrid}>{daysInMonthMatrix.map((day, index) => { const formattedDayString = day ? `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}` : ''; const isSelected = txDate === formattedDayString; return ( <TouchableOpacity key={index} style={[styles.calendarDayCell, isSelected && styles.calendarDayCellSelected]} disabled={!day} onPress={() => { setTxDate(formattedDayString); setDatePickerVisible(false); }}>{day && <Text style={[styles.calendarDayText, isSelected && styles.calendarDayTextSelected]}>{day}</Text>}</TouchableOpacity> ); })}</View>
          </View>
        </View>
      </Modal>

      {/* MODAL 4: BUDGET MATRIX ALLOCATION RESTRICTION LIMITER */}
      <Modal animationType="fade" transparent visible={budgetModalVisible} onRequestClose={() => setBudgetModalVisible(false)}>
        <View style={styles.centeredModalOverlay}>
          <View style={[styles.modalBody, { width: isDesktopLayout ? 400 : '90%', borderRadius: 16 }]}>
            <Text style={styles.modalTitleText}>Set Category Ceiling Limit</Text>
            <Text style={{ color: '#64748B', fontSize: 13, marginBottom: 16 }}>Establish a targeted spending restriction allowance for this category node.</Text>
            <TextInput style={styles.massiveInput} placeholder="0" placeholderTextColor="#1E293B" keyboardType="numeric" value={newBudgetLimit} onChangeText={setNewBudgetLimit} autoFocus />
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}><TouchableOpacity style={[styles.executeActionBtn, { flex: 1, backgroundColor: '#1E293B' }]} onPress={() => setBudgetModalVisible(false)}><Text style={[styles.executeBtnTxt, { color: '#FFF' }]}>Cancel</Text></TouchableOpacity><TouchableOpacity style={[styles.executeActionBtn, { flex: 1 }]} onPress={handleUpdateBudget}><Text style={styles.executeBtnTxt}>Apply Limit</Text></TouchableOpacity></View>
          </View>
        </View>
      </Modal>

      {/* MODAL 5: SUBSCRIPTION SETUP ENGINE */}
      <Modal animationType="slide" transparent visible={subModalVisible} onRequestClose={() => setSubModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBody, { width: isDesktopLayout ? 450 : '100%' }]}>
            <Text style={styles.modalTitleText}>Map Structural Subscription Bill</Text>
            <TextInput style={styles.lineFieldInput} placeholder="Billing provider name (e.g. Spotify)" placeholderTextColor="#4A5568" value={newSubDesc} onChangeText={setNewSubDesc} />
            <TextInput style={styles.massiveInput} placeholder="$0.00" placeholderTextColor="#1E293B" keyboardType="numeric" value={newSubAmount} onChangeText={setNewSubAmount} />
            <View style={styles.chipMatrixRow}>{INITIAL_CATEGORIES.filter(c => c.type === 'expense').map(cat => (<TouchableOpacity key={cat.id} style={[styles.filterChip, newSubCat === cat.id && { backgroundColor: cat.color, borderColor: cat.color }]} onPress={() => setNewSubCat(cat.id)}><Text style={[styles.chipLabelText, newSubCat === cat.id && { color: '#000', fontWeight: '700' }]}>{cat.name}</Text></TouchableOpacity>))}</View>
            <TouchableOpacity style={styles.executeActionBtn} onPress={handleCreateSubscription}><Text style={styles.executeBtnTxt}>Add to Architecture</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

// --- EXTENDED SYSTEM STYLES SYSTEM DESIGN SPECIFICATION ---
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#070A13' },
  globalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 16, borderBottomWidth: 1, borderColor: '#141B2D', paddingTop: Platform.OS === 'ios' ? 12 : 16 },
  brandTitle: { fontSize: 16, fontWeight: '900', color: '#F3F4F6', letterSpacing: -0.3 },
  headerScopeBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0F172A', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#1E293B' },
  headerScopeText: { color: '#E2E8F0', fontSize: 12, fontWeight: '700' },
  mainScroll: { padding: 20, alignSelf: 'center', paddingBottom: 140 },
  viewContainer: { gap: 20 },
  premiumHeroCard: { backgroundColor: '#0F172A', borderRadius: 20, padding: 24, borderWidth: 1, borderColor: '#1E293B', alignItems: 'center' },
  heroLabel: { fontSize: 10, fontWeight: '800', color: '#64748B', letterSpacing: 1.5, marginBottom: 4 },
  heroMainValue: { fontSize: 38, fontWeight: '900', letterSpacing: -1 },
  heroSplitRow: { flexDirection: 'row', borderTopWidth: 1, borderColor: '#1E293B', paddingTop: 18, width: '100%', alignItems: 'center', marginTop: 18 },
  miniMetricBox: { flex: 1, alignItems: 'center' },
  dividerLine: { width: 1, height: 24, backgroundColor: '#1E293B' },
  miniLabel: { fontSize: 10, color: '#64748B', textTransform: 'uppercase', marginBottom: 2 },
  miniValue: { fontSize: 15, fontWeight: '700' },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  sectionTitle: { fontSize: 11, fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: 0.8 },
  actionHeaderPill: { backgroundColor: '#1E293B', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#334155' },
  actionHeaderPillText: { color: '#38BDF8', fontSize: 11, fontWeight: '700' },
  filterPillGroup: { flexDirection: 'row', gap: 4, backgroundColor: '#0F172A', padding: 3, borderRadius: 8 },
  miniPill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  miniPillActive: { backgroundColor: '#1E293B' },
  miniPillText: { fontSize: 11, fontWeight: '600', color: '#64748B' },
  miniPillTextActive: { color: '#38BDF8' },
  txRowCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#0F172A', padding: 14, borderRadius: 14, borderWidth: 1, borderColor: '#1E293B' },
  txLeftAlign: { flexDirection: 'row', alignItems: 'center' },
  txIconBox: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  txDescText: { fontSize: 14, fontWeight: '600', color: '#E2E8F0' },
  txDateSub: { fontSize: 11, color: '#64748B', marginTop: 1 },
  txRightAlign: { flexDirection: 'row', alignItems: 'center' },
  txAmountMetric: { fontSize: 14, fontWeight: '700' },
  contextHeader: { fontSize: 20, fontWeight: '800', color: '#F3F4F6', letterSpacing: -0.5 },
  analyticsCard: { backgroundColor: '#0F172A', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#1E293B', gap: 14 },
  bpTopLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  bpName: { fontSize: 13, fontWeight: '600', color: '#E2E8F0' },
  bpNumbers: { fontSize: 13, fontWeight: '700', color: '#F3F4F6' },
  bpTrackContainer: { height: 6, backgroundColor: '#1E293B', borderRadius: 10, overflow: 'hidden' },
  bpTrackIndicator: { height: '100%', borderRadius: 10 },
  emptyStateText: { color: '#475569', fontSize: 13, textAlign: 'center', paddingVertical: 12 },
  sankeyContainer: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  sankeyPillar: { gap: 8 },
  sankeyNodeHeader: { fontSize: 9, fontWeight: '800', color: '#475569', marginBottom: 2, letterSpacing: 0.3 },
  sankeyNodeBlock: { borderRadius: 12, padding: 12, justifyContent: 'center', minWidth: 110, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  sankeyNodeText: { color: '#070A13', fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  sankeyNodeValue: { color: '#070A13', fontSize: 16, fontWeight: '900', marginTop: 2 },
  sankeyVectorsColumn: { alignItems: 'center', justifyContent: 'space-around', height: 110, width: 24 },
  sankeyTargetStrip: { padding: 10, backgroundColor: '#070A13', borderRadius: 8, borderLeftWidth: 4, borderWidth: 1, borderColor: '#1E293B', gap: 2, marginVertical: 1 },
  sankeyStripLabel: { color: '#94A3B8', fontSize: 10, fontWeight: '700' },
  sankeyStripValue: { color: '#FFF', fontSize: 13, fontWeight: '800' },
  runwayRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#070A13', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#1E293B', marginVertical: 2 },
  runwayPoint: { gap: 2 },
  runwayTime: { color: '#F3F4F6', fontSize: 13, fontWeight: '700' },
  runwayDesc: { color: '#475569', fontSize: 11 },
  runwayValue: { fontSize: 15, fontWeight: '800', color: '#10B981' },
  insightCard: { width: 210, backgroundColor: '#070A13', borderWidth: 1, padding: 12, borderColor: '#1E293B', borderRadius: 12, justifyContent: 'space-between' },
  insightTitle: { color: '#F3F4F6', fontSize: 12, fontWeight: '700' },
  insightDesc: { color: '#64748B', fontSize: 11, lineHeight: 14, marginTop: 2 },
  fabTrigger: { position: 'absolute', bottom: 96, right: 24, backgroundColor: '#38BDF8', width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', elevation: 6, zIndex: 99 },
  tabNavBar: { position: 'absolute', bottom: 20, left: 20, right: 20, height: 64, backgroundColor: '#0F172A', borderRadius: 20, borderWidth: 1, borderColor: '#1E293B', flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  tabItem: { alignItems: 'center', flex: 1, gap: 3 },
  tabLabel: { fontSize: 10, color: '#64748B', fontWeight: '600' },
  tabLabelActive: { color: '#38BDF8', fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(5, 7, 12, 0.8)', justifyContent: 'flex-end', alignItems: 'center' },
  centeredModalOverlay: { flex: 1, backgroundColor: 'rgba(5, 7, 12, 0.8)', justifyContent: 'center', alignItems: 'center' },
  modalBody: { backgroundColor: '#0F172A', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, borderWidth: 1, borderColor: '#1E293B' },
  modalHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitleText: { fontSize: 16, fontWeight: '800', color: '#F3F4F6' },
  segControlRow: { flexDirection: 'row', backgroundColor: '#070A13', borderRadius: 10, padding: 4, marginBottom: 20 },
  segBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
  segBtnActive: { backgroundColor: '#1E293B' },
  segTxt: { fontSize: 13, fontWeight: '600', color: '#64748B' },
  segTxtActive: { color: '#38BDF8' },
  massiveInput: { fontSize: 44, fontWeight: '900', textAlign: 'center', marginBottom: 16, color: '#FFF' },
  lineFieldInput: { borderBottomWidth: 1, borderColor: '#1E293B', paddingVertical: 10, fontSize: 14, color: '#FFF', marginBottom: 16 },
  chipMatrixRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 28 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#1E293B', backgroundColor: '#070A13' },
  chipLabelText: { fontSize: 12, color: '#94A3B8', fontWeight: '500' },
  executeActionBtn: { backgroundColor: '#38BDF8', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  executeBtnTxt: { color: '#070A13', fontSize: 14, fontWeight: '900' },
  historySelectRow: { paddingVertical: 14, borderBottomWidth: 1, borderColor: '#1E293B' },
  historySelectName: { color: '#E2E8F0', fontSize: 14, fontWeight: '600' },
  dateSelectorToggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#070A13', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#1E293B', marginBottom: 20 },
  dateToggleText: { color: '#94A3B8', fontSize: 13, fontWeight: '500' },
  dateValueHighlight: { color: '#38BDF8', fontSize: 13, fontWeight: '700', letterSpacing: 0.3 },
  calendarCardFrame: { backgroundColor: '#0F172A', borderRadius: 20, padding: 24, borderWidth: 1, borderColor: '#1E293B' },
  calendarNavHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingHorizontal: 4 },
  calendarWeekRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  calendarWeekHeaderCell: { color: '#475569', fontSize: 11, fontWeight: '700', width: `${100 / 7}%`, textAlign: 'center' },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 6 },
  calendarDayCell: { width: `${100 / 7}%`, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  calendarDayCellSelected: { backgroundColor: '#38BDF8' },
  calendarDayText: { color: '#E2E8F0', fontSize: 13, fontWeight: '500' },
  calendarDayTextSelected: { color: '#070A13', fontWeight: '800' }
});