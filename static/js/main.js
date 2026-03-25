(() => {
    const THEME_KEY = 'barberia_theme';

    // Qué hace: inicializa el botón de cambio de tema claro/oscuro.
    // Qué valida: existencia del botón y preferencia guardada/sistema.
    // Qué retorna: N/A.
    function initThemeToggle() {
        const root = document.documentElement;
        const toggle = document.getElementById('theme-toggle');

        if (!toggle) {
            return;
        }

        const applyTheme = (theme) => {
            root.setAttribute('data-theme', theme);
            toggle.textContent = theme === 'dark' ? '☀️' : '🌙';
            // Re-render charts so axis labels, grid lines and legend adapt to the new theme
            if (typeof rerenderCharts === 'function') rerenderCharts();
        };

        const savedTheme = localStorage.getItem(THEME_KEY);
        const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        applyTheme(savedTheme || (systemPrefersDark ? 'dark' : 'light'));

        toggle.addEventListener('click', (e) => {
            const current = root.getAttribute('data-theme') || 'light';
            const next = current === 'dark' ? 'light' : 'dark';

            if (!document.startViewTransition) {
                applyTheme(next);
                localStorage.setItem(THEME_KEY, next);
                return;
            }

            const x = e.clientX || innerWidth / 2;
            const y = e.clientY || innerHeight / 2;
            const endRadius = Math.hypot(
                Math.max(x, innerWidth - x),
                Math.max(y, innerHeight - y)
            );

            const transition = document.startViewTransition(() => {
                applyTheme(next);
                localStorage.setItem(THEME_KEY, next);
            });

            transition.ready.then(() => {
                const clipPath = [
                    `circle(0px at ${x}px ${y}px)`,
                    `circle(${endRadius}px at ${x}px ${y}px)`
                ];

                document.documentElement.animate(
                    {
                        clipPath: next === 'dark' ? clipPath : [...clipPath].reverse(),
                    },
                    {
                        duration: 500,
                        easing: 'ease-in-out',
                        pseudoElement: next === 'dark' ? '::view-transition-new(root)' : '::view-transition-old(root)',
                    }
                );
            });
        });
    }

    // Qué hace: consulta y actualiza los horarios disponibles de reserva.
    // Qué valida: selección de servicio, empleado y fecha, además de respuesta API.
    // Qué retorna: N/A.
    function initAvailability() {
        const serviceInput = document.getElementById('service_name');
        const employeeInput = document.getElementById('employee_id');
        const dateInput = document.getElementById('date');
        const timeSelect = document.getElementById('time');

        if (!serviceInput || !employeeInput || !dateInput || !timeSelect) {
            return;
        }

        const refreshAvailability = async () => {
            const serviceName = serviceInput.value;
            const employeeId = employeeInput.value;
            const date = dateInput.value;

            if (!serviceName || !employeeId || !date) {
                timeSelect.innerHTML = '<option value="">Primero selecciona servicio, empleado y fecha</option>';
                return;
            }

            timeSelect.innerHTML = '<option value="">Cargando horarios...</option>';

            try {
                const query = new URLSearchParams({
                    service_name: serviceName,
                    employee_id: employeeId,
                    date,
                });
                const response = await fetch(`/api/availability?${query.toString()}`);
                const data = await response.json();

                if (!response.ok) {
                    timeSelect.innerHTML = `<option value="">${data.error || 'Error al cargar horarios'}</option>`;
                    return;
                }

                if (!data.slots.length) {
                    timeSelect.innerHTML = '<option value="">No hay horarios disponibles</option>';
                    return;
                }

                timeSelect.innerHTML = '<option value="">Selecciona horario...</option>';
                data.slots.forEach((slot) => {
                    const option = document.createElement('option');
                    option.value = slot;
                    option.textContent = slot;
                    timeSelect.appendChild(option);
                });
            } catch {
                timeSelect.innerHTML = '<option value="">No se pudo actualizar</option>';
            }
        };

        serviceInput.addEventListener('change', refreshAvailability);
        employeeInput.addEventListener('change', refreshAvailability);
        dateInput.addEventListener('change', refreshAvailability);
        setInterval(refreshAvailability, 20000);
    }

    // Qué hace: restringe el selector de fecha de reserva al rango permitido.
    // Qué valida: existencia del input y límites entre hoy y fin de año.
    // Qué retorna: N/A.
    function initBookingDateLimits() {
        const dateInput = document.getElementById('date');
        if (!dateInput) {
            return;
        }

        const now = new Date();
        const currentYear = now.getFullYear();
        const minDate = new Date(currentYear, now.getMonth(), now.getDate());
        const maxDate = new Date(currentYear, 11, 31);
        const toDateLocal = (value) => {
            const pad = (n) => String(n).padStart(2, '0');
            return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
        };

        dateInput.min = toDateLocal(minDate);
        dateInput.max = toDateLocal(maxDate);
    }

    // Qué hace: aplica límites mínimo/máximo al datetime del pago móvil.
    // Qué valida: existencia del input y atributos `data-min-allowed`/`data-max-allowed`.
    // Qué retorna: N/A.
    function initPaymentDatetimeLimits() {
        const paymentDatetimeInput = document.getElementById('payment_datetime');
        if (!paymentDatetimeInput) {
            return;
        }

        const now = new Date();
        const pad = (value) => String(value).padStart(2, '0');
        const toDatetimeLocal = (value) => (
            `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`
        );

        const minAllowed = paymentDatetimeInput.dataset.minAllowed;
        const maxAllowed = paymentDatetimeInput.dataset.maxAllowed;
        const nowLocal = toDatetimeLocal(now);

        if (minAllowed) {
            paymentDatetimeInput.min = minAllowed;
        }

        paymentDatetimeInput.max = maxAllowed || nowLocal;
    }

    // Qué hace: inicializa FullCalendar en el panel admin y carga eventos.
    // Qué valida: existencia del contenedor y disponibilidad de la librería FullCalendar.
    // Qué retorna: N/A.
    function initAdminCalendar() {
        const calendarElement = document.getElementById('admin-calendar');

        if (!calendarElement || typeof FullCalendar === 'undefined') {
            return;
        }

        const eventsUrl = calendarElement.dataset.eventsUrl;

        const calendar = new FullCalendar.Calendar(calendarElement, {
            initialView: 'dayGridMonth',
            locale: 'es',
            height: 'auto',
            headerToolbar: window.innerWidth < 768 ? {
                left: 'prev,next',
                center: 'title',
                right: 'today'
            } : {
                left: 'prev,next today',
                center: 'title',
                right: 'dayGridMonth,timeGridWeek,timeGridDay',
            },
            buttonText: {
                today: 'Hoy',
                month: 'Mes',
                week: 'Semana',
                day: 'Día',
            },
            events: async (_, successCallback, failureCallback) => {
                try {
                    const response = await fetch(eventsUrl);
                    if (!response.ok) {
                        failureCallback(new Error('No se pudieron cargar las citas'));
                        return;
                    }
                    successCallback(await response.json());
                } catch (error) {
                    failureCallback(error);
                }
            },
            eventTimeFormat: {
                hour: '2-digit',
                minute: '2-digit',
                meridiem: false,
            },
            eventClick: ({ event }) => {
                const { client_name, client_email, status } = event.extendedProps;
                alert(`Cliente: ${client_name}\nEmail: ${client_email}\nEstado: ${status}`);
            },
        });

        calendar.render();
    }

    // Persistent chart instance references so we can destroy & re-render on theme change
    let _barChart = null;
    let _doughnutChart = null;

    // Qué hace: lee el tema actual y devuelve colores para Chart.js.
    function _chartColors() {
        const dark = document.documentElement.getAttribute('data-theme') === 'dark';
        return {
            dark,
            text:        dark ? '#f1f5f9' : '#475569',
            grid:        dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
            barFill:     dark ? 'rgba(96,165,250,0.75)'  : 'rgba(37,99,235,0.75)',
            barBorder:   dark ? 'rgba(147,197,253,1)'    : 'rgba(29,78,216,1)',
            doughnutBorder: dark ? '#0f172a' : '#ffffff',
            legendColor: dark ? '#f1f5f9' : '#334155',
        };
    }

    // Qué hace: renderiza (o re-renderiza) el gráfico de barras de citas por día.
    // Destruye la instancia previa si existe para garantizar colores correctos.
    function initAdminMetricsChart() {
        const chartCanvas = document.getElementById('appointmentsByDayChart');
        const dataScript  = document.getElementById('appointments-by-day-data');

        if (!chartCanvas || !dataScript || typeof Chart === 'undefined') return;

        let points = [];
        try { points = JSON.parse(dataScript.textContent || '[]'); } catch { points = []; }

        const labels = points.map(i => i.date);
        const values = points.map(i => i.count);
        const c = _chartColors();

        Chart.defaults.color = c.text;

        if (_barChart) { _barChart.destroy(); _barChart = null; }

        _barChart = new Chart(chartCanvas, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: 'Citas',
                    data: values,
                    backgroundColor: c.barFill,
                    borderColor:     c.barBorder,
                    borderWidth: 1,
                    borderRadius: 6,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: {
                        ticks: { color: c.text },
                        grid:  { color: c.grid },
                    },
                    y: {
                        beginAtZero: true,
                        ticks:  { precision: 0, color: c.text },
                        grid:   { color: c.grid },
                    },
                },
            },
        });
    }

    // Qué hace: renderiza (o re-renderiza) el gráfico de estados de citas (doughnut).
    // Destruye la instancia previa si existe para garantizar colores correctos.
    function initAdminStatusChart() {
        const chartCanvas = document.getElementById('appointmentsStatusChart');
        const dataScript  = document.getElementById('appointments-status-data');

        if (!chartCanvas || !dataScript || typeof Chart === 'undefined') return;

        let status = { pending_payment: 0, scheduled: 0, completed: 0, canceled: 0 };
        try { status = JSON.parse(dataScript.textContent || '{}'); } catch { /**/ }

        const c = _chartColors();

        if (_doughnutChart) { _doughnutChart.destroy(); _doughnutChart = null; }

        _doughnutChart = new Chart(chartCanvas, {
            type: 'doughnut',
            data: {
                labels: ['Pendiente pago', 'Agendadas', 'Atendidas', 'Canceladas'],
                datasets: [{
                    data: [
                        status.pending_payment || 0,
                        status.scheduled       || 0,
                        status.completed       || 0,
                        status.canceled        || 0,
                    ],
                    backgroundColor: ['#7c3aed', '#2563eb', '#059669', '#dc2626'],
                    borderColor: c.doughnutBorder,
                    borderWidth: 2,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: c.legendColor, padding: 12, boxWidth: 14 },
                    },
                },
            },
        });
    }

    // Convenience: re-render both charts (called after theme change)
    function rerenderCharts() {
        initAdminMetricsChart();
        initAdminStatusChart();
    }

    // Qué hace: inicia la cuenta regresiva para vencimiento del pago.
    // Qué valida: elementos del temporizador, segundos restantes y URL de redirección al expirar.
    // Qué retorna: N/A.
    function initPaymentCountdown() {
        const timerElement = document.getElementById('payment-timer');
        const countdownElement = document.getElementById('payment-countdown');
        const paymentForm = document.getElementById('payment-proof-form');
        const submitButton = document.getElementById('payment-submit-button');
        const expiredRedirectUrl = timerElement?.dataset.expiredRedirectUrl;

        if (!timerElement || !countdownElement) {
            return;
        }

        let remainingSeconds = Number(timerElement.dataset.remainingSeconds || '0');

        const disablePaymentForm = () => {
            if (!paymentForm) {
                return;
            }

            const fields = paymentForm.querySelectorAll('input, button');
            fields.forEach((field) => {
                field.disabled = true;
            });

            if (submitButton) {
                submitButton.textContent = 'Tiempo expirado';
            }
        };

        const formatSeconds = (seconds) => {
            const mins = Math.floor(seconds / 60);
            const secs = seconds % 60;
            return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
        };

        const render = () => {
            countdownElement.textContent = formatSeconds(Math.max(remainingSeconds, 0));
        };

        render();

        if (remainingSeconds <= 0) {
            disablePaymentForm();
            if (expiredRedirectUrl) {
                setTimeout(() => {
                    window.location.href = expiredRedirectUrl;
                }, 800);
            }
            return;
        }

        const intervalId = setInterval(() => {
            remainingSeconds -= 1;
            render();

            if (remainingSeconds <= 0) {
                clearInterval(intervalId);
                disablePaymentForm();
                if (expiredRedirectUrl) {
                    setTimeout(() => {
                        window.location.href = expiredRedirectUrl;
                    }, 800);
                }
            }
        }, 1000);
    }

    initThemeToggle();
    initBookingDateLimits();
    initPaymentDatetimeLimits();
    initAvailability();
    initAdminCalendar();
    initAdminMetricsChart();
    initAdminStatusChart();
    initPaymentCountdown();
})();
