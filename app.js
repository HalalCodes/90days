/**
 *৯০ দিনের গোল হাব - App Core Logic
 * Architectural Highlights:
 * - IndexedDB Engine (Schema Versioning & Persistence)
 * - Pure Bengali UI Engine & Navigation
 * - Goal Day Calculation Engine (Timezone & Date-bound)
 * - Persisted 3-Minute Cooldown State Machine
 * - Direct Client-Side OneSignal REST API Manager
 * - Backup & JSON Importer
 */

class GoalHubApp {
    constructor() {
        this.db = null;
        this.dbName = 'GoalHubDB';
        this.dbVersion = 1;
        this.currentView = 'home';
        this.cooldownTimer = null;
        this.motivationNotes = [];
        this.currentMotivationIdx = 0;

        // State defaults
        this.state = {
            goalInitialized: false,
            durationDays: 90,
            startDate: new Date().toISOString().split('T')[0],
            cooldownEndTime: null,
            oneSignalAppId: '',
            oneSignalApiKey: '',
            theme: 'dark'
        };

        this.init();
    }

    async init() {
        await this.initIndexedDB();
        await this.loadSettings();
        this.setupEventListeners();
        this.setupNavigation();
        this.applyTheme(this.state.theme);
        this.checkOnlineStatus();
        this.renderGoalDashboard();
        this.checkCooldownState();
        this.initOneSignal();
        this.loadNotes();
        this.loadNotifications();
        this.registerServiceWorker();
    }

    /* ==========================================================================
       1. INDEXEDDB ENGINE
       ========================================================================== */
    initIndexedDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('settings')) {
                    db.createObjectStore('settings', { keyPath: 'key' });
                }
                if (!db.objectStoreNames.contains('notes')) {
                    db.createObjectStore('notes', { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains('notifications')) {
                    db.createObjectStore('notifications', { keyPath: 'id' });
                }
            };

            request.onsuccess = (e) => {
                this.db = e.target.result;
                resolve();
            };

            request.onerror = (e) => {
                console.error('IndexedDB error:', e);
                reject(e);
            };
        });
    }

    async getDBData(storeName, key) {
        return new Promise((resolve) => {
            const tx = this.db.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const request = key ? store.get(key) : store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => resolve(null);
        });
    }

    async saveDBData(storeName, item) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const request = store.put(item);
            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(false);
        });
    }

    async deleteDBData(storeName, key) {
        return new Promise((resolve) => {
            const tx = this.db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const request = store.delete(key);
            request.onsuccess = () => resolve(true);
            request.onerror = () => resolve(false);
        });
    }

    /* ==========================================================================
       2. SETTINGS & APP STATE
       ========================================================================== */
    async loadSettings() {
        const savedSettings = await this.getDBData('settings');
        if (savedSettings && Array.isArray(savedSettings)) {
            savedSettings.forEach(item => {
                this.state[item.key] = item.value;
            });
        }

        // Fill form fields if existing
        if (document.getElementById('oneSignalAppId')) {
            document.getElementById('oneSignalAppId').value = this.state.oneSignalAppId || '';
            document.getElementById('oneSignalApiKey').value = this.state.oneSignalApiKey || '';
            document.getElementById('themeSelect').value = this.state.theme || 'dark';
            document.getElementById('goalDurationSelect').value = this.state.durationDays || 90;
        }
    }

    async updateSetting(key, value) {
        this.state[key] = value;
        await this.saveDBData('settings', { key, value });
    }

    /* ==========================================================================
       3. NAVIGATION & UI ROUTER
       ========================================================================== */
    setupNavigation() {
        const navItems = document.querySelectorAll('.nav-item');
        navItems.forEach(item => {
            item.addEventListener('click', () => {
                const target = item.getAttribute('data-target');
                this.navigateTo(target);
            });
        });
    }

    navigateTo(viewName) {
        this.currentView = viewName;
        document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

        const targetPanel = document.getElementById(`view-${viewName}`);
        const targetNav = document.querySelector(`.nav-item[data-target="${viewName}"]`);

        if (targetPanel) targetPanel.classList.add('active');
        if (targetNav) targetNav.classList.add('active');

        if (viewName === 'home') this.renderGoalDashboard();
        if (viewName === 'notes') this.loadNotes();
        if (viewName === 'notifications') this.loadNotifications();
    }

    showToast(message) {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.classList.remove('hidden');
        setTimeout(() => toast.classList.add('hidden'), 3000);
    }

    checkOnlineStatus() {
        const statusEl = document.getElementById('onlineStatus');
        const updateStatus = () => {
            if (navigator.onLine) {
                statusEl.innerHTML = '<span class="status-dot online"></span> অনলাইন';
            } else {
                statusEl.innerHTML = '<span class="status-dot"></span> অফলাইন';
            }
        };
        window.addEventListener('online', updateStatus);
        window.addEventListener('offline', updateStatus);
        updateStatus();
    }

    applyTheme(theme) {
        let activeTheme = theme;
        if (theme === 'system') {
            activeTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        }
        document.documentElement.setAttribute('data-theme', activeTheme);
        this.updateSetting('theme', theme);
    }

    /* ==========================================================================
       4. GOAL SYSTEM ENGINE (BENGALI DATE CALCULATIONS)
       ========================================================================== */
    calculateGoalProgress() {
        const start = new Date(this.state.startDate);
        const today = new Date();
        
        // Zero-out hours for precise day diff
        start.setHours(0, 0, 0, 0);
        today.setHours(0, 0, 0, 0);

        const diffTime = today.getTime() - start.getTime();
        const currentDay = Math.max(1, Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1);
        
        const totalDays = parseInt(this.state.durationDays, 10);
        const remainingDays = Math.max(0, totalDays - currentDay);
        const progressPercent = Math.min(100, Math.round((currentDay / totalDays) * 100));

        const endDate = new Date(start);
        endDate.setDate(endDate.getDate() + (totalDays - 1));

        return {
            currentDay,
            totalDays,
            remainingDays,
            progressPercent,
            startDateStr: start.toLocaleDateString('bn-BD'),
            endDateStr: endDate.toLocaleDateString('bn-BD')
        };
    }

    renderGoalDashboard() {
        const data = this.calculateGoalProgress();

        document.getElementById('goalDayBadge').textContent = `দিন ${this.toBengaliNumeral(data.currentDay)}`;
        document.getElementById('goalRemainingBadge').textContent = `${this.toBengaliNumeral(data.remainingDays)} দিন বাকি`;
        document.getElementById('goalTitleDisplay').textContent = `আজ আপনার লক্ষ্যের ${this.toBengaliNumeral(data.currentDay)}তম দিন`;
        document.getElementById('goalDatesDisplay').textContent = `শুরু: ${data.startDateStr} | শেষ: ${data.endDateStr}`;
        document.getElementById('progressPercent').textContent = `${this.toBengaliNumeral(data.progressPercent)}%`;
        document.getElementById('progressBarFill').style.width = `${data.progressPercent}%`;
    }

    toBengaliNumeral(num) {
        const bnNums = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
        return num.toString().replace(/\d/g, d => bnNums[d]);
    }

    /* ==========================================================================
       5. 3-MINUTE PERSISTED COOLDOWN TIMER ENGINE
       ========================================================================== */
    triggerCooldown() {
        const now = Date.now();
        const cooldownTime = 3 * 60 * 1000; // 3 Minutes
        const endTime = now + cooldownTime;

        this.updateSetting('cooldownEndTime', endTime);
        this.startCooldownTimer(endTime);
    }

    checkCooldownState() {
        const endTime = this.state.cooldownEndTime;
        if (endTime && Date.now() < endTime) {
            this.startCooldownTimer(endTime);
        }
    }

    startCooldownTimer(endTime) {
        const modal = document.getElementById('cooldownModal');
        const display = document.getElementById('cooldownDisplay');
        modal.classList.remove('hidden');

        if (this.cooldownTimer) clearInterval(this.cooldownTimer);

        const updateTimer = () => {
            const remaining = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
            if (remaining <= 0) {
                clearInterval(this.cooldownTimer);
                modal.classList.add('hidden');
                this.updateSetting('cooldownEndTime', null);
                this.showToast('কুলডাউন সমাপ্ত হয়েছে!');
            } else {
                const mins = Math.floor(remaining / 60);
                const secs = remaining % 60;
                display.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
            }
        };

        updateTimer();
        this.cooldownTimer = setInterval(updateTimer, 1000);
    }

    /* ==========================================================================
       6. NOTES ENGINE
       ========================================================================== */
    async loadNotes(filter = 'all') {
        const notes = await this.getDBData('notes') || [];
        const container = document.getElementById('notesList');
        container.innerHTML = '';

        let filteredNotes = notes;
        if (filter === 'daily') filteredNotes = notes.filter(n => n.showInDailyView);
        if (filter === 'archived') filteredNotes = notes.filter(n => n.archived);

        document.getElementById('noteCountText').textContent = `${this.toBengaliNumeral(notes.length)} টি নোট`;

        if (filteredNotes.length === 0) {
            container.innerHTML = `<p class="text-sm text-muted text-center py-4">কোনো নোট পাওয়া যায়নি।</p>`;
            return;
        }

        // Render Motivation Slider Filter
        this.motivationNotes = notes.filter(n => n.showInDailyView && !n.archived);
        this.renderMotivationSlider();

        filteredNotes.forEach(note => {
            const card = document.createElement('div');
            card.className = 'card';
            card.innerHTML = `
                <div class="flex-between">
                    <h4>${note.title}</h4>
                    <small class="text-muted">${new Date(note.createdAt).toLocaleDateString('bn-BD')}</small>
                </div>
                <p class="mt-2 text-sm">${note.content}</p>
                <div class="flex-between mt-3">
                    <span class="badge ${note.showInDailyView ? '' : 'btn-secondary'}">${note.showInDailyView ? 'দৈনিক স্লাইডার' : 'সাধারণ'}</span>
                    <div>
                        <button class="btn btn-sm btn-secondary" onclick="app.editNote('${note.id}')">সম্পাদনা</button>
                        <button class="btn btn-sm btn-danger" onclick="app.deleteNote('${note.id}')">মুছুন</button>
                    </div>
                </div>
            `;
            container.appendChild(card);
        });
    }

    renderMotivationSlider() {
        const slider = document.getElementById('motivationSlider');
        if (this.motivationNotes.length === 0) {
            slider.innerHTML = `
                <div class="slide-item active">
                    <p class="motivation-text">"ছোট ছোট পদক্ষেপই বড় পরিবর্তন আনে।"</p>
                    <span class="motivation-meta">দৈনিক অনুপ্রেরণা সংযুক্ত করুন</span>
                </div>`;
            return;
        }

        const note = this.motivationNotes[this.currentMotivationIdx % this.motivationNotes.length];
        slider.innerHTML = `
            <div class="slide-item active">
                <p class="motivation-text">"${note.content}"</p>
                <span class="motivation-meta">— ${note.title}</span>
            </div>`;
    }

    async saveNote(e) {
        e.preventDefault();
        const id = document.getElementById('noteIdInput').value || 'note_' + Date.now();
        const title = document.getElementById('noteTitleInput').value;
        const content = document.getElementById('noteContentInput').value;
        const showInDailyView = document.getElementById('noteShowDailyInput').checked;

        const note = {
            id,
            title,
            content,
            showInDailyView,
            archived: false,
            createdAt: Date.now()
        };

        await this.saveDBData('notes', note);
        document.getElementById('noteModal').classList.add('hidden');
        this.showToast('নোট সংরক্ষণ করা হয়েছে');
        this.loadNotes();
    }

    async editNote(id) {
        const note = await this.getDBData('notes', id);
        if (note) {
            document.getElementById('noteIdInput').value = note.id;
            document.getElementById('noteTitleInput').value = note.title;
            document.getElementById('noteContentInput').value = note.content;
            document.getElementById('noteShowDailyInput').checked = note.showInDailyView;
            document.getElementById('noteModalTitle').textContent = 'নোট সম্পাদনা করুন';
            document.getElementById('noteModal').classList.remove('hidden');
        }
    }

    async deleteNote(id) {
        if (confirm('আপনি কি সত্যিই এই নোটটি মুছে ফেলতে চান?')) {
            await this.deleteDBData('notes', id);
            this.showToast('নোটটি মুছে ফেলা হয়েছে');
            this.loadNotes();
        }
    }

    /* ==========================================================================
       7. ONESIGNAL WEB PUSH & REST API ENGINE
       ========================================================================== */
    initOneSignal() {
        window.OneSignalDeferred = window.OneSignalDeferred || [];
        OneSignalDeferred.push(async (OneSignal) => {
            if (this.state.oneSignalAppId) {
                await OneSignal.init({
                    appId: this.state.oneSignalAppId,
                    allowLocalhostAsSecureOrigin: true,
                });
                this.updateNotificationPermissionUI();
            }
        });
    }

    async updateNotificationPermissionUI() {
        const banner = document.getElementById('notifPermissionBanner');
        if ('Notification' in window) {
            const perm = Notification.permission;
            if (perm === 'granted') {
                banner.className = 'alert-box alert-success';
                banner.style.borderColor = 'var(--accent)';
                document.getElementById('permStatusTitle').textContent = 'নোটিফিকেশন সক্রিয় আছে ✓';
                document.getElementById('permStatusDesc').textContent = 'আপনি সময়মত সমস্ত রিমাইন্ডার পাবেন।';
                document.getElementById('requestPermBtn').classList.add('hidden');
            } else {
                banner.className = 'alert-box';
                document.getElementById('requestPermBtn').classList.remove('hidden');
            }
        }
    }

    async requestNotificationPermission() {
        if ('Notification' in window) {
            const perm = await Notification.requestPermission();
            this.updateNotificationPermissionUI();
            if (perm === 'granted') {
                this.showToast('নোটিফিকেশন অনুমতি প্রদান করা হয়েছে');
            } else {
                this.showToast('অনুমতি প্রত্যাখ্যান করা হয়েছে');
            }
        }
    }

    async sendTestNotification() {
        if (!this.state.oneSignalAppId || !this.state.oneSignalApiKey) {
            alert('পরীক্ষা করার আগে OneSignal App ID ও API Key সেটআপ করুন।');
            return;
        }

        const data = this.calculateGoalProgress();
        const payload = {
            app_id: this.state.oneSignalAppId,
            included_segments: ["Subscribed Users"],
            contents: { en: `টেস্ট নোটিফিকেশন: আজকের লক্ষ্য — দিন ${data.currentDay}` },
            headings: { en: "৯০ দিনের গোল হাব" }
        };

        try {
            const response = await fetch('https://onesignal.com/api/v1/notifications', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Basic ${this.state.oneSignalApiKey}`
                },
                body: JSON.stringify(payload)
            });

            const resData = await response.json();
            if (response.ok && !resData.errors) {
                this.showToast('টেস্ট নোটিফিকেশন পাঠানো হয়েছে!');
            } else {
                alert('OneSignal ত্রুটি: ' + JSON.stringify(resData.errors || resData));
            }
        } catch (err) {
            alert('নেটওয়ার্ক সংযোগ ত্রুটি!');
        }
    }

    async loadNotifications() {
        const notifs = await this.getDBData('notifications') || [];
        const container = document.getElementById('notificationsList');
        container.innerHTML = '';

        document.getElementById('notifCountText').textContent = `${this.toBengaliNumeral(notifs.length)} টি নোটিফিকেশন`;

        if (notifs.length === 0) {
            container.innerHTML = `<p class="text-sm text-muted text-center py-4">কোনো নির্ধারিত নোটিফিকেশন নেই।</p>`;
            return;
        }

        notifs.forEach(item => {
            const card = document.createElement('div');
            card.className = 'card';
            card.innerHTML = `
                <div class="flex-between">
                    <h4>${item.title}</h4>
                    <span class="badge ${item.enabled ? '' : 'btn-secondary'}">${item.enabled ? 'সক্রিয়' : 'বন্ধ'}</span>
                </div>
                <p class="mt-1 text-sm">${item.message}</p>
                <div class="flex-between mt-2 text-sm text-muted">
                    <span>⏰ ${item.time} (${item.repeat === 'daily' ? 'প্রতিদিন' : 'একবার'})</span>
                </div>
                <div class="flex-between mt-3">
                    <button class="btn btn-sm btn-secondary" onclick="app.toggleNotif('${item.id}')">${item.enabled ? 'বন্ধ করুন' : 'চালু করুন'}</button>
                    <div>
                        <button class="btn btn-sm btn-secondary" onclick="app.editNotif('${item.id}')">সম্পাদনা</button>
                        <button class="btn btn-sm btn-danger" onclick="app.deleteNotif('${item.id}')">মুছুন</button>
                    </div>
                </div>
            `;
            container.appendChild(card);
        });
    }

    async saveNotification(e) {
        e.preventDefault();
        const id = document.getElementById('notifIdInput').value || 'notif_' + Date.now();
        const title = document.getElementById('notifTitleInput').value;
        const message = document.getElementById('notifMessageInput').value;
        const time = document.getElementById('notifTimeInput').value;
        const repeat = document.getElementById('notifRepeatSelect').value;
        const imageUrl = document.getElementById('notifImageUrlInput').value;
        const enabled = document.getElementById('notifEnabledInput').checked;

        const notif = { id, title, message, time, repeat, imageUrl, enabled };
        await this.saveDBData('notifications', notif);
        document.getElementById('notifModal').classList.add('hidden');
        this.showToast('নোটিফিকেশন সংরক্ষণ করা হয়েছে');
        this.loadNotifications();
    }

    async toggleNotif(id) {
        const notif = await this.getDBData('notifications', id);
        if (notif) {
            notif.enabled = !notif.enabled;
            await this.saveDBData('notifications', notif);
            this.loadNotifications();
        }
    }

    async deleteNotif(id) {
        if (confirm('আপনি কি এই নোটিফিকেশনটি মুছে ফেলতে চান?')) {
            await this.deleteDBData('notifications', id);
            this.loadNotifications();
        }
    }

    /* ==========================================================================
       8. BACKUP & RESTORE ENGINE
       ========================================================================== */
    async exportBackup() {
        const settings = await this.getDBData('settings');
        const notes = await this.getDBData('notes');
        const notifications = await this.getDBData('notifications');

        const backupData = {
            version: 1,
            exportDate: new Date().toISOString(),
            settings,
            notes,
            notifications
        };

        const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `goal_hub_backup_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    async importBackup(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const data = JSON.parse(event.target.result);
                if (data.settings && data.notes) {
                    if (confirm('পুনরুদ্ধার করলে আপনার বর্তমান সমস্ত ডেটা ওভাররাইট হয়ে যাবে। আপনি কি ইচ্ছুক?')) {
                        for (const item of data.settings) await this.saveDBData('settings', item);
                        for (const note of data.notes) await this.saveDBData('notes', note);
                        if (data.notifications) {
                            for (const notif of data.notifications) await this.saveDBData('notifications', notif);
                        }
                        alert('পুনরুদ্ধার সফল হয়েছে!');
                        window.location.reload();
                    }
                } else {
                    alert('অবৈধ ব্যাকআপ ফাইল!');
                }
            } catch (err) {
                alert('ফাইল পড়তে সমস্যা হয়েছে!');
            }
        };
        reader.readAsText(file);
    }

    async clearAllData() {
        if (confirm('⚠️ আপনি কি নিশ্চিত যে সমস্ত ডেটা মুছে ফেলবেন? এটি আর কখনো ফিরিয়ে আনা যাবে না!')) {
            indexedDB.deleteDatabase(this.dbName);
            alert('সমস্ত ডেটা মুছে ফেলা হয়েছে।');
            window.location.reload();
        }
    }

    /* ==========================================================================
       9. SERVICE WORKER & EVENT LISTENERS
       ========================================================================== */
    registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('sw.js').catch(err => {
                console.warn('Service Worker registration failed:', err);
            });
        }
    }

    setupEventListeners() {
        // Goal Duration Option Switcher
        document.getElementById('goalDurationSelect').addEventListener('change', (e) => {
            const customGroup = document.getElementById('customDaysGroup');
            if (e.target.value === 'custom') {
                customGroup.classList.remove('hidden');
            } else {
                customGroup.classList.add('hidden');
            }
        });

        // Goal Start Mode Switcher
        document.querySelectorAll('input[name="startMode"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                const pastPicker = document.getElementById('pastDatePickerGroup');
                if (e.target.value === 'past') {
                    pastPicker.classList.remove('hidden');
                } else {
                    pastPicker.classList.add('hidden');
                }
            });
        });

        // Submit Goal Form
        document.getElementById('goalSettingsForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const durationVal = document.getElementById('goalDurationSelect').value;
            const days = durationVal === 'custom' 
                ? document.getElementById('customDaysInput').value 
                : durationVal;

            const mode = document.querySelector('input[name="startMode"]:checked').value;
            let startDate = new Date().toISOString().split('T')[0];

            if (mode === 'past') {
                const pastDate = document.getElementById('pastStartDateInput').value;
                if (pastDate) startDate = pastDate;
            }

            await this.updateSetting('durationDays', days);
            await this.updateSetting('startDate', startDate);
            await this.updateSetting('goalInitialized', true);

            this.showToast('লক্ষ্য সফলভাবে কনফিগার করা হয়েছে');
            this.renderGoalDashboard();
            this.navigateTo('home');
        });

        // Cooldown Action Button
        document.getElementById('triggerCooldownBtn').addEventListener('click', () => {
            this.triggerCooldown();
        });

        document.getElementById('closeCooldownBtn').addEventListener('click', () => {
            document.getElementById('cooldownModal').classList.add('hidden');
        });

        // Note Modal Controls
        document.getElementById('quickAddBtn').addEventListener('click', () => {
            document.getElementById('noteForm').reset();
            document.getElementById('noteIdInput').value = '';
            document.getElementById('noteModalTitle').textContent = 'নতুন নোট লিখুন';
            document.getElementById('noteModal').classList.remove('hidden');
        });

        document.getElementById('addNewNoteBtn').addEventListener('click', () => {
            document.getElementById('quickAddBtn').click();
        });

        document.getElementById('closeNoteModal').addEventListener('click', () => {
            document.getElementById('noteModal').classList.add('hidden');
        });

        document.getElementById('cancelNoteBtn').addEventListener('click', () => {
            document.getElementById('noteModal').classList.add('hidden');
        });

        document.getElementById('noteForm').addEventListener('submit', (e) => this.saveNote(e));

        // Notification Modal Controls
        document.getElementById('addNewNotifBtn').addEventListener('click', () => {
            document.getElementById('notifForm').reset();
            document.getElementById('notifIdInput').value = '';
            document.getElementById('notifModal').classList.remove('hidden');
        });

        document.getElementById('closeNotifModal').addEventListener('click', () => {
            document.getElementById('notifModal').classList.add('hidden');
        });

        document.getElementById('cancelNotifBtn').addEventListener('click', () => {
            document.getElementById('notifModal').classList.add('hidden');
        });

        document.getElementById('notifForm').addEventListener('submit', (e) => this.saveNotification(e));

        // OneSignal Config Form
        document.getElementById('oneSignalConfigForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const appId = document.getElementById('oneSignalAppId').value.trim();
            const apiKey = document.getElementById('oneSignalApiKey').value.trim();

            await this.updateSetting('oneSignalAppId', appId);
            await this.updateSetting('oneSignalApiKey', apiKey);

            this.showToast('OneSignal কনফিগারেশন সংরক্ষণ করা হয়েছে');
            this.initOneSignal();
        });

        document.getElementById('testOneSignalConnBtn').addEventListener('click', () => {
            this.sendTestNotification();
        });

        document.getElementById('requestPermBtn').addEventListener('click', () => {
            this.requestNotificationPermission();
        });

        // Backup & Restore Events
        document.getElementById('exportBackupBtn').addEventListener('click', () => this.exportBackup());
        document.getElementById('importBackupTrigger').addEventListener('click', () => document.getElementById('importBackupFile').click());
        document.getElementById('importBackupFile').addEventListener('change', (e) => this.importBackup(e));
        document.getElementById('clearAllDataBtn').addEventListener('click', () => this.clearAllData());

        // Theme Change
        document.getElementById('themeSelect').addEventListener('change', (e) => {
            this.applyTheme(e.target.value);
        });

        // Reset Goal
        document.getElementById('resetGoalBtn').addEventListener('click', async () => {
            if (confirm('আপনি কি সত্যিই বর্তমান লক্ষ্য রিসেট করে নতুন লক্ষ্য শুরু করতে চান?')) {
                await this.updateSetting('startDate', new Date().toISOString().split('T')[0]);
                this.renderGoalDashboard();
                this.showToast('নতুন লক্ষ্য আজ থেকে পুনঃসূচনা হয়েছে');
            }
        });
    }
}

// Global App Initialization
window.addEventListener('DOMContentLoaded', () => {
    window.app = new GoalHubApp();
});