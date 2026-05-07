import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { medicationService } from '../services/medicationService';

const formatShortDate = (value) => {
  const dateValue = new Date(value);
  if (Number.isNaN(dateValue.getTime())) {
    return '--';
  }

  return dateValue.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
  });
};

const getStockTagStyle = (item) => {
  if (item.isLowStock) {
    return styles.stockTagLow;
  }

  if (item.daysLeft <= 7) {
    return styles.stockTagSoon;
  }

  return styles.stockTagOk;
};

const getProgressColor = (item) => {
  if (item.isLowStock) {
    return '#e54d67';
  }

  if (item.daysLeft <= 7) {
    return '#f3a144';
  }

  return '#2f8fd0';
};

const MedicineStockScreen = ({ onBack, reminderTextScale = 1 }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [summary, setSummary] = useState({ totalMedications: 0, lowStockCount: 0, totalPills: 0, usedPills: 0 });
  const [inventory, setInventory] = useState([]);
  const [isNotifying, setIsNotifying] = useState({});
  const [showRefillModal, setShowRefillModal] = useState(false);
  const [refillTarget, setRefillTarget] = useState(null);
  const [refillTablets, setRefillTablets] = useState(10);
  const [isRefilling, setIsRefilling] = useState(false);
  const [isRefillNotifying, setIsRefillNotifying] = useState(false);
  const [isRequestingRefill, setIsRequestingRefill] = useState({});
  const textScale = reminderTextScale || 1;

  const loadStock = async () => {
    try {
      setIsLoading(true);
      const stock = await medicationService.getMedicineStockOverview();
      setSummary(stock?.summary || { totalMedications: 0, lowStockCount: 0, totalPills: 0, usedPills: 0 });
      setInventory(stock?.inventory || []);

      const auto = await medicationService.autoNotifyCaregiverForLowStock();
      if ((auto?.autoNotifiedCount || 0) > 0) {
        Alert.alert('Low Stock Alert', `${auto.autoNotifiedCount} low stock notification(s) sent to caregiver.`);
      }
    } catch (error) {
      Alert.alert('Stock Error', error?.response?.data?.error || error?.message || 'Could not load medicine stock.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadStock();
  }, []);

  const sortedInventory = useMemo(() => {
    return [...inventory].sort((a, b) => {
      if (a.isLowStock && !b.isLowStock) {
        return -1;
      }
      if (!a.isLowStock && b.isLowStock) {
        return 1;
      }
      return a.daysLeft - b.daysLeft;
    });
  }, [inventory]);

  const handleManualNotify = async (item) => {
    if (!item?.id) {
      return;
    }

    try {
      setIsNotifying((prev) => ({ ...prev, [item.id]: true }));
      const result = await medicationService.notifyCaregiverLowStock(item.id);
      if (result?.notified) {
        Alert.alert('Notified', 'Caregiver has been notified about low stock.');
      } else {
        Alert.alert('Info', 'Notification was already sent recently.');
      }
    } catch (error) {
      Alert.alert('Notify Failed', error?.response?.data?.error || error?.message || 'Could not notify caregiver.');
    } finally {
      setIsNotifying((prev) => ({ ...prev, [item.id]: false }));
    }
  };

  const openRefillModal = (item) => {
    setRefillTarget(item);
    setRefillTablets(10);
    setShowRefillModal(true);
  };

  const handleConfirmRefill = async () => {
    if (!refillTarget?.id) {
      return;
    }

    try {
      setIsRefilling(true);
      await medicationService.refillMedicationStock(refillTarget.id, Math.max(1, Number(refillTablets) || 1));
      setShowRefillModal(false);
      await loadStock();
      Alert.alert('Refilled', 'Medicine stock updated successfully.');
    } catch (error) {
      Alert.alert('Refill Failed', error?.response?.data?.error || error?.message || 'Could not refill stock.');
    } finally {
      setIsRefilling(false);
    }
  };

  const handleRefillNotifyCaregiver = async () => {
    if (!refillTarget?.id) {
      return;
    }

    try {
      setIsRefillNotifying(true);
      await medicationService.notifyCaregiverRefill(refillTarget.id);
      Alert.alert('Notified', 'Refill alert sent to caregiver.');
    } catch (error) {
      Alert.alert('Notify Failed', error?.response?.data?.error || error?.message || 'Could not notify caregiver.');
    } finally {
      setIsRefillNotifying(false);
    }
  };

  const handleRequestRefillFromCard = async (item) => {
    if (!item?.id) {
      return;
    }

    try {
      setIsRequestingRefill((prev) => ({ ...prev, [item.id]: true }));
      await medicationService.notifyCaregiverRefill(item.id);
      Alert.alert('Request Sent', 'Caregiver received your refill request.');
    } catch (error) {
      Alert.alert('Request Failed', error?.response?.data?.error || error?.message || 'Could not send refill request.');
    } finally {
      setIsRequestingRefill((prev) => ({ ...prev, [item.id]: false }));
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.headerRow}>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Text style={styles.backIcon}>‹</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { fontSize: 22 * textScale }]}>Medicine Stock</Text>
        <TouchableOpacity style={styles.refreshButton} onPress={loadStock}>
          <Text style={styles.refreshIcon}>↻</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.summaryCard}>
        <View style={styles.summaryBlock}>
          <Text style={[styles.summaryLabel, { fontSize: 13 * textScale }]}>Total Medications</Text>
          <Text style={[styles.summaryValue, { fontSize: 30 * textScale }]}>{summary.totalMedications}</Text>
          <Text style={[styles.summarySubText, { fontSize: 13 * textScale }]}>Pills: {summary.totalPills}</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryBlock}>
          <Text style={[styles.summaryLabel, { fontSize: 13 * textScale }]}>Low Stock</Text>
          <Text style={[styles.summaryDanger, { fontSize: 18 * textScale }]}>{summary.lowStockCount} Need refill soon</Text>
          <Text style={[styles.summarySubText, { fontSize: 13 * textScale }]}>Used: {summary.usedPills} pills</Text>
        </View>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { fontSize: 21 * textScale }]}>Current Inventory</Text>
      </View>

      {isLoading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator size="large" color="#2f8fd0" />
          <Text style={[styles.loaderText, { fontSize: 14 * textScale }]}>Loading inventory...</Text>
        </View>
      ) : (
        <View>
          {sortedInventory.map((item) => (
            <View key={item.id} style={styles.stockCard}>
              <View style={styles.stockTopRow}>
                <View>
                  <Text style={[styles.medName, { fontSize: 19 * textScale }]}>{item.medicineName}</Text>
                  <Text style={[styles.medSub, { fontSize: 13 * textScale }]}>{item.dosageMg}mg • {item.dailyAmount}x daily</Text>
                </View>
                <View style={[styles.stockTag, getStockTagStyle(item)]}>
                  <Text style={[styles.stockTagText, { fontSize: 12 * textScale }]}>{item.stockLabel}</Text>
                </View>
              </View>

              <View style={styles.stockMetaRow}>
                <Text style={[styles.pillsLeftText, { fontSize: 16 * textScale }]}>{item.pillsLeft} pills left</Text>
                <Text style={[styles.percentText, { fontSize: 14 * textScale }]}>{item.coveragePercent}%</Text>
              </View>

              <Text style={[styles.pillUsageText, { fontSize: 12 * textScale }]}>Total: {item.totalPills} pills • Used: {item.usedPills} pills</Text>

              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${item.coveragePercent}%`, backgroundColor: getProgressColor(item) }]} />
              </View>

              <View style={styles.refillInfoRow}>
                <Text style={[styles.refillInfoText, { fontSize: 13 * textScale }]}>Next Refill: {formatShortDate(item.nextRefillDate)} ({item.daysLeft} days left)</Text>
              </View>

              <View style={styles.actionRow}>
                <TouchableOpacity style={styles.refillButton} onPress={() => openRefillModal(item)}>
                  <Text style={[styles.refillButtonText, { fontSize: 14 * textScale }]}>Refill Now</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.refillRequestButton}
                  onPress={() => handleRequestRefillFromCard(item)}
                  disabled={!!isRequestingRefill[item.id]}
                >
                  <Text style={[styles.refillRequestButtonText, { fontSize: 14 * textScale }]}>
                    {isRequestingRefill[item.id] ? 'Requesting...' : 'Request Refill'}
                  </Text>
                </TouchableOpacity>

              </View>

              {(item.isLowStock || item.daysLeft <= 7) && (
                <View style={styles.secondaryActionRow}>
                  <TouchableOpacity
                    style={styles.notifyButton}
                    onPress={() => handleManualNotify(item)}
                    disabled={!!isNotifying[item.id]}
                  >
                    <Text style={[styles.notifyButtonText, { fontSize: 14 * textScale }]}>{isNotifying[item.id] ? 'Notifying...' : 'Notify Caregiver'}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ))}

          {!sortedInventory.length && <Text style={[styles.emptyText, { fontSize: 15 * textScale }]}>No medicine stock records yet.</Text>}
        </View>
      )}

      {showRefillModal && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={[styles.modalTitle, { fontSize: 22 * textScale }]}>Refill Tablets</Text>
            <Text style={[styles.modalSubtitle, { fontSize: 14 * textScale }]}>{refillTarget?.medicineName || 'Medicine'}</Text>

            <View style={styles.stepperRow}>
              <TouchableOpacity
                style={styles.stepperButton}
                onPress={() => setRefillTablets((prev) => Math.max(1, prev - 1))}
                disabled={isRefilling || isRefillNotifying}
              >
                <Text style={styles.stepperButtonText}>-</Text>
              </TouchableOpacity>

              <Text style={[styles.stepperValue, { fontSize: 22 * textScale }]}>{refillTablets} tablets</Text>

              <TouchableOpacity
                style={styles.stepperButton}
                onPress={() => setRefillTablets((prev) => Math.min(1000, prev + 1))}
                disabled={isRefilling || isRefillNotifying}
              >
                <Text style={styles.stepperButtonText}>+</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.modalPrimaryButton}
              onPress={handleConfirmRefill}
              disabled={isRefilling || isRefillNotifying}
            >
              <Text style={[styles.modalPrimaryButtonText, { fontSize: 15 * textScale }]}>{isRefilling ? 'Updating...' : 'Confirm Refill'}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.modalSecondaryButton}
              onPress={handleRefillNotifyCaregiver}
              disabled={isRefilling || isRefillNotifying}
            >
              <Text style={[styles.modalSecondaryButtonText, { fontSize: 15 * textScale }]}>{isRefillNotifying ? 'Notifying...' : 'Notify Caregiver'}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.modalCancelButton}
              onPress={() => setShowRefillModal(false)}
              disabled={isRefilling || isRefillNotifying}
            >
              <Text style={[styles.modalCancelButtonText, { fontSize: 15 * textScale }]}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 14,
    backgroundColor: '#f4f6f8',
    flexGrow: 1,
    paddingBottom: 24,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backIcon: {
    fontSize: 24,
    color: '#445a6d',
    marginTop: -2,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#23313d',
  },
  refreshButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  refreshIcon: {
    fontSize: 17,
    color: '#3a688f',
    fontWeight: '700',
  },
  summaryCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e8edf2',
  },
  summaryBlock: {
    flex: 1,
  },
  summaryDivider: {
    width: 1,
    backgroundColor: '#e2e8ee',
    marginHorizontal: 10,
  },
  summaryLabel: {
    fontSize: 12,
    color: '#6e7f8d',
  },
  summaryValue: {
    marginTop: 2,
    fontSize: 28,
    fontWeight: '700',
    color: '#243748',
  },
  summaryDanger: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '700',
    color: '#d64a5f',
  },
  summarySubText: {
    marginTop: 4,
    color: '#5f7281',
    fontSize: 12,
    fontWeight: '600',
  },
  sectionHeader: {
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 20,
    color: '#2b3d4c',
    fontWeight: '700',
  },
  stockCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e6ebf0',
  },
  stockTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  medName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#273947',
  },
  medSub: {
    marginTop: 2,
    color: '#657786',
    fontSize: 12,
  },
  stockTag: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  stockTagLow: {
    backgroundColor: '#fbe1e6',
  },
  stockTagSoon: {
    backgroundColor: '#fff0d9',
  },
  stockTagOk: {
    backgroundColor: '#e2f3ff',
  },
  stockTagText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#435564',
  },
  stockMetaRow: {
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pillsLeftText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#2c3f4e',
  },
  percentText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#5d7386',
  },
  pillUsageText: {
    marginTop: 6,
    fontSize: 12,
    color: '#627684',
    fontWeight: '600',
  },
  progressTrack: {
    marginTop: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: '#e9eef2',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
  },
  refillInfoRow: {
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#d8e2eb',
    backgroundColor: '#f7fbff',
  },
  refillInfoText: {
    color: '#5f7588',
    fontSize: 12,
    fontWeight: '600',
  },
  actionRow: {
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  refillButton: {
    flex: 1,
    marginRight: 8,
    backgroundColor: '#2f8fd0',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 38,
  },
  refillButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  refillRequestButton: {
    flex: 1,
    marginLeft: 8,
    borderWidth: 1,
    borderColor: '#2f8fd0',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 38,
    backgroundColor: '#eef6ff',
  },
  refillRequestButtonText: {
    color: '#2f6f9f',
    fontWeight: '700',
    fontSize: 12,
  },
  secondaryActionRow: {
    marginTop: 8,
  },
  notifyButton: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#2f8fd0',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 38,
    backgroundColor: '#f5faff',
  },
  notifyButtonText: {
    color: '#2f6f9f',
    fontWeight: '700',
    fontSize: 12,
  },
  loaderWrap: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  loaderText: {
    marginTop: 10,
    color: '#607585',
  },
  emptyText: {
    marginTop: 26,
    textAlign: 'center',
    color: '#677a88',
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(28, 36, 46, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#2a3b4b',
  },
  modalSubtitle: {
    marginTop: 2,
    marginBottom: 10,
    color: '#657786',
    fontSize: 13,
    fontWeight: '600',
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  stepperButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d4e0ea',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5faff',
  },
  stepperButtonText: {
    fontSize: 22,
    color: '#2f6f9f',
    fontWeight: '700',
    marginTop: -2,
  },
  stepperValue: {
    fontSize: 20,
    color: '#2c3f4e',
    fontWeight: '700',
  },
  modalPrimaryButton: {
    borderRadius: 10,
    backgroundColor: '#2f8fd0',
    paddingVertical: 11,
    alignItems: 'center',
    marginBottom: 8,
  },
  modalPrimaryButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  modalSecondaryButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2f8fd0',
    backgroundColor: '#f4f9ff',
    paddingVertical: 11,
    alignItems: 'center',
    marginBottom: 8,
  },
  modalSecondaryButtonText: {
    color: '#2f6f9f',
    fontWeight: '700',
    fontSize: 14,
  },
  modalCancelButton: {
    borderRadius: 10,
    backgroundColor: '#eef2f5',
    paddingVertical: 10,
    alignItems: 'center',
  },
  modalCancelButtonText: {
    color: '#5e7180',
    fontWeight: '700',
    fontSize: 13,
  },
});

export default MedicineStockScreen;
