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

const TARGETS = {
  income: 7650,
  fixed: 2750,
  variable: 1300,
  savings: 3600
};

const DEFAULT_BUDGETS = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0, '6': 0 };

export default function App() {
  const [activeTab, setActiveTab] = useState('home');
  const [transactions, setTransactions] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [budgets, setBudgets] = useState(DEFAULT_BUDGETS);

  const currentSystemMonth = '2026-06';
  const [selectedMonth, setSelectedMonth] = useState('2026-06');
  const [sortBy, setSortBy] = useState('all');

  // Modal States
  const [modalVisible, setModalVisible] = useState(false);
  const [budgetModalVisible, setBudgetModalVisible] = useState(false);
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [historyMenuVisible, setHistoryMenuVisible] = useState(false);

  // Form Context States
  const [editingTxId, setEditingTxId] = useState(null);
  const [focusedBudgetId, setFocusedBudgetId] = useState(null);
  const [newBudgetLimit, setNewBudgetLimit] = useState('');
  const [amount, setAmount] = useState('');
  const [type, setType] = useState('expense');
  const [selectedCategory, setSelectedCategory] = useState(INITIAL_CATEGORIES[0].id);
  const [description, setDescription] = useState('');
  const [txDate, setTxDate] = useState('');
  const [markAsRecurring, setMarkAsRecurring] = useState(false);

  // Calendar Engine Local Parameter Blocks
  const [calendarYear, setCalendarYear] = useState(2026);
  const [calendarMonth, setCalendarMonth] = useState(5);

  // Layout calculations
  const [dimensions, setDimensions] = useState(Dimensions.get('window'));

  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', ({ window }) => {
      setDimensions(window);
    });
    return () => subscription?.remove();
  }, []);

  const isDesktopLayout = Platform.OS === 'web' && dimensions.width > 768;

  // --- UNIFIED DATE UTILITY ENGINE ---
  const formatMonthLabel = (scopeStr) => {
    if (!scopeStr) return '';
    if (scopeStr === '2026') return 'Full Year 2026';
    const [year, month] = scopeStr.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1, 2);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  // --- PERSISTENCE ---
  useEffect(() => {
    const loadSavedData = async () => {
      try {
        if (Platform.OS === 'web') {
          const storedTx = localStorage.getItem('@tx_logs');
          const storedSubs = localStorage.getItem('@recurring_blueprints');
          const storedBudgets = localStorage.getItem('@budget_limits');
          if (storedTx) setTransactions(JSON.parse(storedTx));
          if (storedSubs) setSubscriptions(JSON.parse(storedSubs));
          if (storedBudgets) setBudgets(JSON.parse(storedBudgets));
        }
      } catch (e) { console.error("Persistence loading fault", e); }
    };
    loadSavedData();
  }, []);

  const saveAndSync = (newTx, newSubs = null, newBudgets = null) => {
    setTransactions(newTx);
    if (Platform.OS === 'web') localStorage.setItem('@tx_logs', JSON.stringify(newTx));

    const activeSubs = newSubs !== null ? newSubs : subscriptions;
    setSubscriptions(activeSubs);
    if (Platform.OS === 'web') localStorage.setItem('@recurring_blueprints', JSON.stringify(activeSubs));

    const activeBudgets = newBudgets !== null ? newBudgets : budgets;
    setBudgets(activeBudgets);
    if (Platform.OS === 'web') localStorage.setItem('@budget_limits', JSON.stringify(activeBudgets));
  };

  // --- RECURRING ENGINE LOGIC ---
  useEffect(() => {
    if (subscriptions.length === 0) return;
    if (selectedMonth === '2026') return;

    const generatedKeysForThisMonth = new Set(
      transactions
        .filter(t => t.date.startsWith(selectedMonth) && t.subscriptionBlueprintId)
        .map(t => t.subscriptionBlueprintId)
    );
    const pendingInjections = subscriptions.filter(sub => !generatedKeysForThisMonth.has(sub.id));

    if (pendingInjections.length > 0) {
      const freshClones = pendingInjections.map((sub, index) => ({
        id: `auto_${Date.now()}_${sub.id}_${index}`,
        amount: sub.amount,
        type: sub.type,
        categoryId: sub.categoryId,
        date: `${selectedMonth}-01`,
        description: `🔄 ${sub.description}`,
        subscriptionBlueprintId: sub.id
      }));

      setTransactions(prev => {
        const integrated = [...freshClones, ...prev];
        if (Platform.OS === 'web') localStorage.setItem('@tx_logs', JSON.stringify(integrated));
        return integrated;
      });
    }
  }, [subscriptions, selectedMonth]);

  // --- MULTI-SCOPE METRICS ADAPTER GENERATOR ---
  const monthMetrics = useMemo(() => {
    let scopedTx = transactions.filter(t => t.date.startsWith(selectedMonth));

    let income = 0; let expense = 0;
    let fixedTotal = 0;
    let variableTotal = 0;
    const catTotals = {};

    scopedTx.forEach(t => {
      catTotals[t.categoryId] = (catTotals[t.categoryId] || 0) + t.amount;
      const cat = INITIAL_CATEGORIES.find(c => c.id === t.categoryId);
      if (t.type === 'income') {
        income += t.amount;
      } else {
        expense += t.amount;
        if (cat?.class === 'fixed') fixedTotal += t.amount;
        if (cat?.class === 'variable') variableTotal += t.amount;
      }
    });

    const netSaved = income - expense;
    const savingsRate = income > 0 ? (netSaved / income) * 100 : 0;

    const scaleMultiplier = selectedMonth === '2026' ? 12 : 1;
    const currentTargets = {
      income: TARGETS.income * scaleMultiplier,
      fixed: TARGETS.fixed * scaleMultiplier,
      variable: TARGETS.variable * scaleMultiplier
    };

    if (sortBy === 'income') scopedTx = scopedTx.filter(t => t.type === 'income');
    if (sortBy === 'expense') scopedTx = scopedTx.filter(t => t.type === 'expense');

    return {
      transactions: scopedTx, income, expense, balance: netSaved, savingsRate,
      fixedTotal, variableTotal, catTotals, targetBenchmarks: currentTargets
    };
  }, [transactions, selectedMonth, sortBy]);

  const uniqueMonths = useMemo(() => {
    const monthsSet = new Set(transactions.map(t => t.date.substring(0, 7)));
    monthsSet.add(currentSystemMonth);
    monthsSet.add('2026-07');

    const formattedList = Array.from(monthsSet).sort().reverse();
    return ['2026', ...formattedList];
  }, [transactions]);

  // --- MINI EMBEDDED CALENDAR CALCULATOR ENGINE ---
  const daysInMonthMatrix = useMemo(() => {
    const startDayOfWeek = new Date(calendarYear, calendarMonth, 1).getDay();
    const totalDays = new Date(calendarYear, calendarMonth + 1, 0).getDate();
    const grid = [];
    for (let i = 0; i < startDayOfWeek; i++) grid.push(null);
    for (let day = 1; day <= totalDays; day++) grid.push(day);
    return grid;
  }, [calendarYear, calendarMonth]);

  const changeCalendarMonth = (direction) => {
    let newM = calendarMonth + direction;
    let newY = calendarYear;
    if (newM > 11) { newM = 0; newY += 1; }
    if (newM < 0) { newM = 11; newY -= 1; }
    setCalendarMonth(newM);
    setCalendarYear(newY);
  };

  const cleanInputToFloat = (rawVal) => {
    if (!rawVal) return 0;
    const sanitized = rawVal.replace(/[\$,\s]/g, '');
    const parsed = parseFloat(sanitized);
    return isNaN(parsed) ? 0 : parsed;
  };

  const openCreateModal = () => {
    setEditingTxId(null); setAmount(''); setDescription(''); setType('expense');
    setTxDate(new Date().toISOString().split('T')[0]);
    setMarkAsRecurring(false); setSelectedCategory(INITIAL_CATEGORIES.find(c => c.type === 'expense')?.id || '1');
    setModalVisible(true);
  };

  const openEditModal = (tx) => {
    setEditingTxId(tx.id);
    setAmount(tx.amount.toString());
    setDescription(tx.description.replace('🔄 ', ''));
    setType(tx.type); setTxDate(tx.date);
    setMarkAsRecurring(!!tx.subscriptionBlueprintId);
    setSelectedCategory(tx.categoryId);
    setModalVisible(true);
  };

  const handleSaveTransaction = () => {
    const parsedAmount = cleanInputToFloat(amount);
    if (parsedAmount <= 0) return;

    const parsedDesc = description.trim() || INITIAL_CATEGORIES.find(c => c.id === selectedCategory)?.name;
    const validatedDate = txDate.trim() || new Date().toISOString().split('T')[0];

    if (editingTxId) {
      const baseTx = transactions.find(t => t.id === editingTxId);
      let targetBlueprintId = baseTx?.subscriptionBlueprintId;
      let secondarySubs = [...subscriptions];

      if (markAsRecurring && !targetBlueprintId) {
        targetBlueprintId = `sub_blueprint_${Date.now()}`;
        secondarySubs.push({ id: targetBlueprintId, description: parsedDesc, amount: parsedAmount, categoryId: selectedCategory, type });
      }
      else if (targetBlueprintId) {
        secondarySubs = secondarySubs.map(s => s.id === targetBlueprintId ? {
          ...s, description: parsedDesc, amount: parsedAmount, categoryId: selectedCategory, type
        } : s);
      }

      const updated = transactions.map(t => (t.id === editingTxId ? {
        ...t, amount: parsedAmount, type, categoryId: selectedCategory, date: validatedDate,
        description: targetBlueprintId || markAsRecurring ? `🔄 ${parsedDesc}` : parsedDesc,
        subscriptionBlueprintId: targetBlueprintId
      } : t));

      saveAndSync(updated, secondarySubs, budgets);
    } else {
      const trackingBlueprintId = `sub_blueprint_${Date.now()}`;
      const newTx = {
        id: Date.now().toString(), amount: parsedAmount, type, categoryId: selectedCategory, date: validatedDate,
        description: markAsRecurring ? `🔄 ${parsedDesc}` : parsedDesc,
        subscriptionBlueprintId: markAsRecurring ? trackingBlueprintId : undefined
      };

      let secondarySubs = [...subscriptions];
      if (markAsRecurring) {
        secondarySubs.push({ id: trackingBlueprintId, description: parsedDesc, amount: parsedAmount, categoryId: selectedCategory, type });
      }
      saveAndSync([newTx, ...transactions], secondarySubs, budgets);
    }
    setModalVisible(false); setEditingTxId(null); setSortBy('all');
  };

  const handleUpdateBudget = () => {
    const cleanedLimit = cleanInputToFloat(newBudgetLimit);
    const updatedBudgets = { ...budgets, [focusedBudgetId]: cleanedLimit };
    saveAndSync(transactions, subscriptions, updatedBudgets);
    setBudgetModalVisible(false); setNewBudgetLimit('');
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* GLOBAL HEADER */}
      <View style={styles.globalHeader}>
        <Text style={styles.brandTitle}>financial.friend</Text>
        <TouchableOpacity style={styles.headerScopeBadge} onPress={() => setHistoryMenuVisible(true)}>
          <Ionicons name="calendar-outline" size={13} color="#38BDF8" style={{ marginRight: 5 }} />
          <Text style={styles.headerScopeText}>{formatMonthLabel(selectedMonth)}</Text>
          <Ionicons name="chevron-down" size={12} color="#64748B" style={{ marginLeft: 4 }} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={[styles.mainScroll, { width: isDesktopLayout ? 650 : '100%' }]} showsVerticalScrollIndicator={false}>

        {/* TAB 1: THE LEDGER ACTIVITY FEED */}
        {activeTab === 'home' && (
          <View style={styles.viewContainer}>
            <View style={styles.premiumHeroCard}>
              <Text style={styles.heroLabel}>NET OPERATING SURPLUS</Text>
              <Text style={[styles.heroMainValue, { color: monthMetrics.balance >= 0 ? '#10B981' : '#EF4444' }]}>
                ${monthMetrics.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </Text>
              <View style={styles.heroSplitRow}>
                <View style={styles.miniMetricBox}>
                  <Text style={styles.miniLabel}>Making</Text>
                  <Text style={[styles.miniValue, { color: '#10B981' }]}>+${monthMetrics.income.toLocaleString()}</Text>
                </View>
                <View style={styles.dividerLine} />
                <View style={styles.miniMetricBox}>
                  <Text style={styles.miniLabel}>Spending</Text>
                  <Text style={[styles.miniValue, { color: '#F3F4F6' }]}>-${monthMetrics.expense.toLocaleString()}</Text>
                </View>
              </View>
            </View>

            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Activity Stream</Text>
              <View style={styles.filterPillGroup}>
                {['all', 'income', 'expense'].map((pill) => (
                  <TouchableOpacity key={pill} style={[styles.miniPill, sortBy === pill && styles.miniPillActive]} onPress={() => setSortBy(pill)}>
                    <Text style={[styles.miniPillText, sortBy === pill && styles.miniPillTextActive]}>
                      {pill === 'expense' ? 'Spending' : pill.charAt(0).toUpperCase() + pill.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {monthMetrics.transactions.map(tx => {
              const cat = INITIAL_CATEGORIES.find(c => c.id === tx.categoryId);
              return (
                <TouchableOpacity key={tx.id} style={styles.txRowCard} onPress={() => openEditModal(tx)}>
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
                    {/* RESTORED: Red Trash Icon for On-Demand Ledger Cleanup */}
                    <TouchableOpacity style={{ marginLeft: 16 }} onPress={() => saveAndSync(transactions.filter(t => t.id !== tx.id), subscriptions, budgets)}>
                      <Ionicons name="trash-outline" size={14} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* TAB 2: EFFICIENCY BLUEPRINT ENGINE */}
        {activeTab === 'analysis' && (
          <View style={styles.viewContainer}>
            <Text style={styles.contextHeader}>{selectedMonth === '2026' ? 'Cumulative Blueprint' : 'Monthly Blueprint'}</Text>

            <View style={styles.analyticsCard}>
              <View style={styles.scoreRow}>
                <View>
                  <Text style={styles.heroLabel}>ACTUAL EFFICIENCY RATE</Text>
                  <Text style={[styles.scoreValue, { color: monthMetrics.savingsRate >= 45 ? '#10B981' : '#F59E0B' }]}>
                    {Math.round(monthMetrics.savingsRate)}% <Text style={{ fontSize: 14, color: '#64748B' }}>saved</Text>
                  </Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: monthMetrics.savingsRate >= 47 ? '#064E3B' : '#78350F' }]}>
                  <Text style={[styles.statusBadgeText, { color: monthMetrics.savingsRate >= 47 ? '#10B981' : '#F59E0B' }]}>
                    {monthMetrics.savingsRate >= 47 ? 'GOOD CRUISE' : 'BURN OVERAGE'}
                  </Text>
                </View>
              </View>

              <View style={styles.blueprintMetricLine}>
                <Text style={styles.blueprintLabel}>Net Take-Home Pay</Text>
                <Text style={styles.blueprintValue}>${monthMetrics.income.toLocaleString()} <Text style={{ color: '#475569', fontSize: 11 }}>/ target ${monthMetrics.targetBenchmarks.income.toLocaleString()}</Text></Text>
              </View>

              <View style={{ marginTop: 12 }}>
                <View style={styles.bpTopLine}>
                  <Text style={styles.bpName}>Rent & Structural Fixed Costs</Text>
                  <Text style={styles.bpNumbers}>${monthMetrics.fixedTotal.toLocaleString()} <Text style={{ color: '#475569' }}>/ max ${monthMetrics.targetBenchmarks.fixed.toLocaleString()}</Text></Text>
                </View>
                <View style={styles.bpTrackContainer}>
                  <View style={[styles.bpTrackIndicator, { width: `${Math.min((monthMetrics.fixedTotal / monthMetrics.targetBenchmarks.fixed) * 100, 100)}%`, backgroundColor: monthMetrics.fixedTotal > monthMetrics.targetBenchmarks.fixed ? '#EF4444' : '#4DABF7' }]} />
                </View>
                <Text style={[styles.adviceTag, { color: monthMetrics.fixedTotal <= monthMetrics.targetBenchmarks.fixed ? '#10B981' : '#EF4444' }]}>
                  {monthMetrics.fixedTotal <= monthMetrics.targetBenchmarks.fixed ? '✓ Fixed structural parameters secure' : '✗ Fixed structural parameters broken'}
                </Text>
              </View>

              <View style={{ marginTop: 16 }}>
                <View style={styles.bpTopLine}>
                  <Text style={styles.bpName}>Variable Spending (Dining & Groceries, Shops, Trips)</Text>
                  <Text style={styles.bpNumbers}>${monthMetrics.variableTotal.toLocaleString()} <Text style={{ color: '#475569' }}>/ max ${monthMetrics.targetBenchmarks.variable.toLocaleString()}</Text></Text>
                </View>
                <View style={styles.bpTrackContainer}>
                  <View style={[styles.bpTrackIndicator, { width: `${Math.min((monthMetrics.variableTotal / monthMetrics.targetBenchmarks.variable) * 100, 100)}%`, backgroundColor: monthMetrics.variableTotal > monthMetrics.targetBenchmarks.variable ? '#EF4444' : '#DA77F2' }]} />
                </View>
                <Text style={[styles.adviceTag, { color: monthMetrics.variableTotal <= monthMetrics.targetBenchmarks.variable ? '#10B981' : '#EF4444' }]}>
                  {monthMetrics.variableTotal <= monthMetrics.targetBenchmarks.variable ? `✓ Doing Great: $${(monthMetrics.targetBenchmarks.variable - monthMetrics.variableTotal).toLocaleString()} runway remaining` : '✗ Alert: Outflows scaling past defensive perimeter'}
                </Text>
              </View>
            </View>

            <Text style={styles.sectionTitle}>Custom Category Limits Progress</Text>
            <View style={styles.analyticsCard}>
              {INITIAL_CATEGORIES.filter(c => c.type === 'expense').map(cat => {
                const spent = monthMetrics.catTotals[cat.id] || 0;
                const baseLimit = budgets[cat.id] || 0;
                const limit = selectedMonth === '2026' ? baseLimit * 12 : baseLimit;
                const ratio = limit > 0 ? Math.min(spent / limit, 1) : 0;

                return (
                  <TouchableOpacity
                    key={cat.id}
                    style={{ marginVertical: 4 }}
                    disabled={selectedMonth === '2026'}
                    onPress={() => { setFocusedBudgetId(cat.id); setNewBudgetLimit(baseLimit > 0 ? baseLimit.toString() : ''); setBudgetModalVisible(true); }}
                  >
                    <View style={styles.bpTopLine}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Ionicons name={cat.icon} size={14} color={cat.color} style={{ marginRight: 6 }} />
                        <Text style={styles.bpName}>{cat.name}</Text>
                      </View>
                      <Text style={styles.bpNumbers}>${spent.toLocaleString()} <Text style={{ color: '#4A5568', fontWeight: '400' }}>/ ${limit.toLocaleString()}</Text></Text>
                    </View>
                    <View style={styles.bpTrackContainer}>
                      <View style={[styles.bpTrackIndicator, { width: `${ratio * 100}%`, backgroundColor: ratio >= 1 ? '#EF4444' : cat.color }]} />
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.sectionTitle}>Accumulation Runway Projections</Text>
            <View style={styles.analyticsCard}>
              <Text style={{ color: '#94A3B8', fontSize: 13, marginBottom: 12 }}>Based on your live tracking surplus of <Text style={{ color: '#10B981', fontWeight: '700' }}>${monthMetrics.balance.toLocaleString()}</Text> for this active scope:</Text>

              <View style={styles.runwayRow}>
                <View style={styles.runwayPoint}>
                  <Text style={styles.runwayTime}>In 1 Cycle</Text>
                  <Text style={styles.runwayDesc}>Deficit clearance core balance buffer</Text>
                </View>
                <Text style={styles.runwayValue}>${(monthMetrics.balance * 1).toLocaleString()}</Text>
              </View>

              <View style={styles.runwayRow}>
                <View style={styles.runwayPoint}>
                  <Text style={styles.runwayTime}>In 6 Cycles</Text>
                  <Text style={styles.runwayDesc}>Core Emergency Base Funding runway</Text>
                </View>
                <Text style={styles.runwayValue}>${(monthMetrics.balance * 6).toLocaleString()}</Text>
              </View>

              <View style={styles.runwayRow}>
                <View style={styles.runwayPoint}>
                  <Text style={styles.runwayTime}>In 1 Year</Text>
                  <Text style={styles.runwayDesc}>Aggressive Wealth Accumulation Yield</Text>
                </View>
                <Text style={[styles.runwayValue, { color: '#38BDF8' }]}>${(monthMetrics.balance * 12).toLocaleString()}</Text>
              </View>
            </View>
          </View>
        )}

        {/* TAB 3: CONSTANT BLUEPRINT SCHEDULER */}
        {activeTab === 'history' && (
          <View style={styles.viewContainer}>
            <Text style={styles.contextHeader}>Recurring Rules Blueprint</Text>
            {subscriptions.map(sub => {
              const cat = INITIAL_CATEGORIES.find(c => c.id === sub.categoryId);
              return (
                <View key={sub.id} style={styles.txRowCard}>
                  <View style={styles.txLeftAlign}>
                    <View style={[styles.txIconBox, { backgroundColor: '#1E293B' }]}><Ionicons name="sync-outline" size={16} color="#38BDF8" /></View>
                    <View>
                      <Text style={styles.txDescText}>{sub.description}</Text>
                      <Text style={styles.txDateSub}>{cat?.name} • Constant Template</Text>
                    </View>
                  </View>
                  <Text style={[styles.txAmountMetric, { color: sub.type === 'income' ? '#10B981' : '#F3F4F6' }]}>
                    {sub.type === 'income' ? '+' : '-'}${sub.amount}
                  </Text>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* FOOTER TAB ATTACHERS */}
      <TouchableOpacity style={styles.fabTrigger} onPress={openCreateModal}><Ionicons name="add" size={24} color="#FFF" /></TouchableOpacity>

      <View style={styles.tabNavBar}>
        <TouchableOpacity style={styles.tabItem} onPress={() => setActiveTab('home')}>
          <Ionicons name="flash" size={18} color={activeTab === 'home' ? '#38BDF8' : '#64748B'} />
          <Text style={[styles.tabLabel, activeTab === 'home' && styles.tabLabelActive]}>Stream</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => setActiveTab('analysis')}>
          <Ionicons name="pie-chart" size={18} color={activeTab === 'analysis' ? '#38BDF8' : '#64748B'} />
          <Text style={[styles.tabLabel, activeTab === 'analysis' && styles.tabLabelActive]}>Efficiency</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => setActiveTab('history')}>
          <Ionicons name="refresh-circle" size={20} color={activeTab === 'history' ? '#38BDF8' : '#64748B'} />
          <Text style={[styles.tabLabel, activeTab === 'history' && styles.tabLabelActive]}>Recurring</Text>
        </TouchableOpacity>
      </View>

      {/* UNIFIED SCOPE SELECTION DROPDOWN MODAL */}
      <Modal animationType="fade" transparent={true} visible={historyMenuVisible} onRequestClose={() => setHistoryMenuVisible(false)}>
        <View style={styles.centeredModalOverlay}>
          <View style={[styles.modalBody, { borderRadius: 16, width: isDesktopLayout ? 420 : '90%' }]}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitleText}>Scope Selection</Text>
              <TouchableOpacity onPress={() => setHistoryMenuVisible(false)}><Ionicons name="close" size={22} color="#64748B" /></TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 250 }}>
              {uniqueMonths.map(m => (
                <TouchableOpacity key={m} style={styles.historySelectRow} onPress={() => { setSelectedMonth(m); setHistoryMenuVisible(false); }}>
                  <Text style={styles.historySelectName}>{formatMonthLabel(m)}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* TRANSACTIONS DIALOG MODAL */}
      <Modal animationType="slide" transparent={true} visible={modalVisible} onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBody, { width: isDesktopLayout ? 500 : '100%' }]}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitleText}>{editingTxId ? 'Edit Entry' : 'New Entry'}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}><Ionicons name="close" size={24} color="#64748B" /></TouchableOpacity>
            </View>
            <View style={styles.segControlRow}>
              <TouchableOpacity style={[styles.segBtn, type === 'expense' && styles.segBtnActive]} onPress={() => setType('expense')}><Text style={[styles.segTxt, type === 'expense' && styles.segTxtActive]}>Spending</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.segBtn, type === 'income' && styles.segBtnActive]} onPress={() => setType('income')}><Text style={[styles.segTxt, type === 'income' && styles.segTxtActive]}>Income</Text></TouchableOpacity>
            </View>
            <TextInput style={styles.massiveInput} placeholder="$0.00" placeholderTextColor="#1E293B" keyboardType="numeric" value={amount} onChangeText={setAmount} />
            <TextInput style={styles.lineFieldInput} placeholder="Tracer item label note..." placeholderTextColor="#4A5568" value={description} onChangeText={setDescription} />

            {/* RESTORED: Interactive Grid Calendar Modal Overlay Activation Row */}
            <TouchableOpacity style={styles.dateSelectorToggleRow} onPress={() => setDatePickerVisible(true)}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="calendar-clear-outline" size={16} color="#38BDF8" style={{ marginRight: 10 }} />
                <Text style={styles.dateToggleText}>Selected Entry Date</Text>
              </View>
              <Text style={styles.dateValueHighlight}>{txDate || 'Select Date'}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.toggleRowContainer]} onPress={() => setMarkAsRecurring(!markAsRecurring)}>
              <Ionicons name={markAsRecurring ? "checkbox" : "square-outline"} size={20} color="#38BDF8" />
              <Text style={styles.toggleRowLabel}>Lock as ongoing monthly recurring item</Text>
            </TouchableOpacity>
            <View style={styles.chipMatrixRow}>
              {INITIAL_CATEGORIES.filter(c => c.type === type).map(cat => (
                <TouchableOpacity key={cat.id} style={[styles.filterChip, selectedCategory === cat.id && { backgroundColor: cat.color, borderColor: cat.color }]} onPress={() => setSelectedCategory(cat.id)}>
                  <Text style={[styles.chipLabelText, selectedCategory === cat.id && { color: '#000', fontWeight: '700' }]}>{cat.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={styles.executeActionBtn} onPress={handleSaveTransaction}><Text style={styles.executeBtnTxt}>Save Entry</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* RESTORED: Embedded Visual Matrix Grid Day Calendar Picker */}
      <Modal animationType="fade" transparent={true} visible={datePickerVisible} onRequestClose={() => setDatePickerVisible(false)}>
        <View style={styles.centeredModalOverlay}>
          <View style={[styles.calendarCardFrame, { width: isDesktopLayout ? 420 : '90%', paddingBottom: 24 }]}>
            <View style={styles.calendarNavHeader}>
              <TouchableOpacity onPress={() => changeCalendarMonth(-1)}><Ionicons name="chevron-back" size={20} color="#38BDF8" /></TouchableOpacity>
              <Text style={{ color: '#FFF', fontSize: 14, fontWeight: '700' }}>
                {new Date(calendarYear, calendarMonth).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </Text>
              <TouchableOpacity onPress={() => changeCalendarMonth(1)}><Ionicons name="chevron-forward" size={20} color="#38BDF8" /></TouchableOpacity>
            </View>
            <View style={styles.calendarWeekRow}>
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, idx) => (
                <Text key={idx} style={styles.calendarWeekHeaderCell}>{day}</Text>
              ))}
            </View>
            <View style={styles.calendarGrid}>
              {daysInMonthMatrix.map((day, index) => {
                const formattedDayString = day ? `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}` : '';
                const isSelected = txDate === formattedDayString;
                return (
                  <TouchableOpacity
                    key={index}
                    style={[styles.calendarDayCell, isSelected && styles.calendarDayCellSelected]}
                    disabled={!day}
                    onPress={() => {
                      setTxDate(formattedDayString);
                      setDatePickerVisible(false);
                    }}
                  >
                    {day && <Text style={[styles.calendarDayText, isSelected && styles.calendarDayTextSelected]}>{day}</Text>}
                  </TouchableOpacity>
                );
              })}
            </View>
            <TouchableOpacity style={[styles.executeActionBtn, { backgroundColor: '#1E293B', marginTop: 16 }]} onPress={() => setDatePickerVisible(false)}>
              <Text style={{ color: '#FFF', fontWeight: '700' }}>Close Calendar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* MODAL 3: ADJUST BUDGET CEILING ALLOWANCE */}
      <Modal animationType="fade" transparent={true} visible={budgetModalVisible} onRequestClose={() => setBudgetModalVisible(false)}>
        <View style={styles.centeredModalOverlay}>
          <View style={[styles.modalBody, { width: isDesktopLayout ? 400 : '90%', borderRadius: 16 }]}>
            <Text style={styles.modalTitleText}>Set Category Ceiling Limit</Text>
            <Text style={{ color: '#64748B', fontSize: 13, marginBottom: 16 }}>Establish a targeted spending restriction allowance for this category node.</Text>

            <TextInput style={styles.massiveInput} placeholder="0" placeholderTextColor="#1E293B" keyboardType="numeric" value={newBudgetLimit} onChangeText={setNewBudgetLimit} autoFocus />

            <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
              <TouchableOpacity style={[styles.executeActionBtn, { flex: 1, backgroundColor: '#1E293B' }]} onPress={() => setBudgetModalVisible(false)}>
                <Text style={[styles.executeBtnTxt, { color: '#FFF' }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.executeActionBtn, { flex: 1 }]} onPress={handleUpdateBudget}>
                <Text style={styles.executeBtnTxt}>Apply Limit</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

// --- CONFIG STYLES SYSTEM ---
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#070A13' },
  globalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 16, borderBottomWidth: 1, borderColor: '#141B2D', paddingTop: Platform.OS === 'ios' ? 12 : 16 },
  brandTitle: { fontSize: 16, fontWeight: '900', color: '#F3F4F6' },
  headerScopeBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0F172A', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#1E293B' },
  headerScopeText: { color: '#E2E8F0', fontSize: 12, fontWeight: '700' },
  mainScroll: { padding: 20, alignSelf: 'center', paddingBottom: 140 },
  viewContainer: { gap: 20 },
  premiumHeroCard: { backgroundColor: '#0F172A', borderRadius: 20, padding: 24, borderWidth: 1, borderColor: '#1E293B', alignItems: 'center' },
  heroLabel: { fontSize: 10, fontWeight: '800', color: '#64748B', letterSpacing: 1.5, marginBottom: 4 },
  heroMainValue: { fontSize: 40, fontWeight: '900', letterSpacing: -1 },
  heroSplitRow: { flexDirection: 'row', borderTopWidth: 1, borderColor: '#1E293B', paddingTop: 18, width: '100%', alignItems: 'center', marginTop: 18 },
  miniMetricBox: { flex: 1, alignItems: 'center' },
  dividerLine: { width: 1, height: 24, backgroundColor: '#1E293B' },
  miniLabel: { fontSize: 10, color: '#64748B', textTransform: 'uppercase', marginBottom: 2 },
  miniValue: { fontSize: 15, fontWeight: '700' },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  sectionTitle: { fontSize: 11, fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: 0.5 },
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
  contextHeader: { fontSize: 20, fontWeight: '800', color: '#F3F4F6' },
  analyticsCard: { backgroundColor: '#0F172A', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#1E293B', gap: 14 },
  scoreRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderColor: '#1E293B', paddingBottom: 14, marginBottom: 4 },
  scoreValue: { fontSize: 32, fontWeight: '900', letterSpacing: -0.5, color: '#FFF' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  statusBadgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  blueprintMetricLine: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  blueprintLabel: { color: '#94A3B8', fontSize: 14, fontWeight: '500' },
  blueprintValue: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  adviceTag: { fontSize: 11, fontWeight: '600', marginTop: 6 },
  runwayRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#070A13', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#1E293B', marginVertical: 2 },
  runwayPoint: { gap: 2 },
  runwayTime: { color: '#F3F4F6', fontSize: 13, fontWeight: '700' },
  runwayDesc: { color: '#475569', fontSize: 11 },
  runwayValue: { fontSize: 15, fontWeight: '800', color: '#10B981' },
  bpTopLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  bpName: { fontSize: 13, fontWeight: '600', color: '#E2E8F0' },
  bpNumbers: { fontSize: 13, fontWeight: '700', color: '#F3F4F6' },
  bpTrackContainer: { height: 6, backgroundColor: '#1E293B', borderRadius: 10, overflow: 'hidden' },
  bpTrackIndicator: { height: '100%', borderRadius: 10 },
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
  toggleRowContainer: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 24 },
  toggleRowLabel: { color: '#94A3B8', fontSize: 13, fontWeight: '500' },
  chipMatrixRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 28 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#1E293B', backgroundColor: '#070A13' },
  chipLabelText: { fontSize: 12, color: '#94A3B8', fontWeight: '500' },
  executeActionBtn: { backgroundColor: '#38BDF8', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  executeBtnTxt: { color: '#070A13', fontSize: 14, fontWeight: '900' },
  historySelectRow: { paddingVertical: 14, borderBottomWidth: 1, borderColor: '#1E293B' },
  historySelectName: { color: '#E2E8F0', fontSize: 14, fontWeight: '600' },

  // Custom Datepicker layout profiles
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