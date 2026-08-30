'use strict';

const path = require('path');

const MSPChainerClass = require('./../js/msp/MSPchainer');
const mspHelper = require('./../js/msp/MSPHelper');
const MSPCodes = require('./../js/msp/MSPCodes');
const MSP = require('./../js/msp');
const { GUI, TABS } = require('./../js/gui');
const FC = require('./../js/fc');
const interval = require('./../js/intervals');
const VTX = require('./../js/vtx');
const i18n = require('./../js/localization');
const Settings = require('./../js/settings');
const features = require('./../js/feature_framework');

TABS.configuration = {};

TABS.configuration.initialize = function (callback, scrollPosition) {

    if (GUI.active_tab != 'configuration') {
        GUI.active_tab = 'configuration';

    }

    var loadChainer = new MSPChainerClass();

    var loadChain = [
        mspHelper.loadFeatures,
        mspHelper.loadSensorAlignment,
        mspHelper.loadAdvancedConfig,
        // mspHelper.loadVTXConfig, // Not implemented yet
        mspHelper.loadBoardAlignment,
        mspHelper.loadCurrentMeterConfig,
        mspHelper.loadMiscV2
    ];
    
    // Load serial config first, then conditionally load MZTC
    function loadSerialAndMZTC(callback) {
        mspHelper.loadSerialPorts(function() {
            // Now check if MZTC_CAMERA is selected
            var mztcSelected = false;
            if (FC.SERIAL_CONFIG && FC.SERIAL_CONFIG.ports) {
                for (var i = 0; i < FC.SERIAL_CONFIG.ports.length; i++) {
                    if (FC.SERIAL_CONFIG.ports[i].functions.indexOf('MZTC_CAMERA') >= 0) {
                        mztcSelected = true;
                        break;
                    }
                }
            }
            
            if (mztcSelected) {
                // Try to load MZTC config with a timeout
                var timeoutId = setTimeout(function() {
                    console.log('MZTC config load timeout - firmware may not support it yet');
                    callback();
                }, 500); // 500ms timeout
                
                mspHelper.loadMZTCConfig(function() {
                    clearTimeout(timeoutId);
                    callback();
                });
            } else {
                callback();
            }
        });
    }
    
    loadChain.push(loadSerialAndMZTC);

    loadChainer.setChain(loadChain);
    loadChainer.setExitPoint(load_html);
    loadChainer.execute();

    var saveChainer = new MSPChainerClass();

    // Conditionally save MZTC config
    function conditionallySaveMZTC(callback) {
        console.log('conditionallySaveMZTC called, FC.MZTC_CONFIG:', FC.MZTC_CONFIG);
        if (FC.MZTC_CONFIG && FC.MZTC_CONFIG.enabled) {
            console.log('Saving MZTC config, enabled:', FC.MZTC_CONFIG.enabled, 'port:', FC.MZTC_CONFIG.port);
            // Try to save MZTC config with a timeout
            var timeoutId = setTimeout(function() {
                console.log('MZTC config save timeout - firmware may not support it yet');
                callback();
            }, 500); // 500ms timeout
            
            mspHelper.saveMZTCConfig(function() {
                clearTimeout(timeoutId);
                console.log('MZTC config saved successfully');
                callback();
            });
        } else {
            console.log('Skipping MZTC save - not enabled or no config');
            callback();
        }
    }
    
    var saveChain = [
        mspHelper.saveAccTrim,
        mspHelper.saveAdvancedConfig,
        // mspHelper.saveVTXConfig, // Not implemented yet
        mspHelper.saveCurrentMeterConfig,
        mspHelper.saveMiscV2,
        conditionallySaveMZTC,
        saveSettings,
        mspHelper.saveToEeprom
    ];

    function saveSettings(onComplete) {
        Settings.saveInputs(onComplete);
    }

    saveChainer.setChain(saveChain);
    saveChainer.setExitPoint(reboot);

    function reboot() {
        //noinspection JSUnresolvedVariable
        GUI.log(i18n.getMessage('configurationEepromSaved'));

        GUI.tab_switch_cleanup(function () {
            MSP.send_message(MSPCodes.MSP_SET_REBOOT, false, false, reinitialize);
        });
    }

    function reinitialize() {
        //noinspection JSUnresolvedVariable
        GUI.log(i18n.getMessage('deviceRebooting'));
        GUI.handleReconnect($('.tab_configuration a'));
    }

    function load_html() {
        GUI.load(path.join(__dirname, "configuration.html"), Settings.processHtml(process_html));
    }

    function process_html() {

        let i;

        // generate features
        var fcFeatures = FC.getFeatures();

        var features_e = $('.features');
        for (let i = 0; i < fcFeatures.length; i++) {
            var row_e,
                tips = [],
                feature_tip_html = '';

            if (fcFeatures[i].showNameInTip) {
                tips.push(i18n.getMessage("manualEnablingTemplate").replace("{name}", fcFeatures[i].name));
            }

            if (fcFeatures[i].haveTip) {
                tips.push(i18n.getMessage("feature" + fcFeatures[i].name + "Tip"));
            }

            if (tips.length > 0) {
                feature_tip_html = '<div class="helpicon cf_tip" title="' + tips.join("<br><br>") + '"></div>';
            }

            row_e = $('<div class="checkbox">' +
                '<input type="checkbox" data-bit="' + fcFeatures[i].bit + '" class="feature toggle" name="' + fcFeatures[i].name + '" title="' + fcFeatures[i].name + '"' +
                ' id="feature-' + fcFeatures[i].bit + '" ' +
                '>' +
                '<label for="feature-' + fcFeatures[i].bit + '">' +
                '<span data-i18n="feature' + fcFeatures[i].name + '"></span>' +
                '</label>' +
                feature_tip_html +
                '</div>');

            features_e.each(function () {
                if ($(this).hasClass(fcFeatures[i].group)) {
                    $(this).after(row_e);
                }
            });
        }

        features.updateUI($('.tab-configuration'), FC.FEATURES);

        // translate to user-selected language
       i18n.localize();;

        // VTX
        var config_vtx = $('.config-vtx');
        if (FC.VTX_CONFIG.device_type != VTX.DEV_UNKNOWN) {

            var vtx_band = $('#vtx_band');
            vtx_band.empty();
            var vtx_no_band_note = $('#vtx_no_band');
            if (FC.VTX_CONFIG.band < VTX.BAND_MIN || FC.VTX_CONFIG.band > VTX.BAND_MAX) {
                var noBandName = i18n.getMessage("configurationNoBand");
                $('<option value="0">' + noBandName + '</option>').appendTo(vtx_band);
                vtx_no_band_note.show();
            } else {
                vtx_no_band_note.hide();
            }
            for (var ii = 0; ii < VTX.BANDS.length; ii++) {
                var band_name = VTX.BANDS[ii].name;
                var option = $('<option value="' + VTX.BANDS[ii].code + '">' + band_name + '</option>');
                if (VTX.BANDS[ii].code == FC.VTX_CONFIG.band) {
                    option.prop('selected', true);
                }
                option.appendTo(vtx_band);
            }
            vtx_band.on('change', function () {
                FC.VTX_CONFIG.band = parseInt($(this).val());
            });

            var vtx_channel = $('#vtx_channel');
            vtx_channel.empty();
            for (var ii = VTX.CHANNEL_MIN; ii <= VTX.CHANNEL_MAX; ii++) {
                var option = $('<option value="' + ii + '">' + ii + '</option>');
                if (ii == FC.VTX_CONFIG.channel) {
                    option.prop('selected', true);
                }
                option.appendTo(vtx_channel);
            }
            vtx_channel.on('change', function () {
                FC.VTX_CONFIG.channel = parseInt($(this).val());
            });

            var vtx_power = $('#vtx_power');
            vtx_power.empty();
            var minPower = VTX.getMinPower(FC.VTX_CONFIG.device_type);
            var maxPower = VTX.getMaxPower(FC.VTX_CONFIG.device_type);
            for (var ii = minPower; ii <= maxPower; ii++) {
                var option = $('<option value="' + ii + '">' + ii + '</option>');
                if (ii == FC.VTX_CONFIG.power) {
                    option.prop('selected', true);
                }
                option.appendTo(vtx_power);
            }
            vtx_power.on('change', function () {
                FC.VTX_CONFIG.power = parseInt($(this).val());
            });

            var vtx_low_power_disarm = $('#vtx_low_power_disarm');
            vtx_low_power_disarm.empty();
            for (var ii = VTX.LOW_POWER_DISARM_MIN; ii <= VTX.LOW_POWER_DISARM_MAX; ii++) {
                var name = i18n.getMessage("configurationVTXLowPowerDisarmValue_" + ii);
                if (!name) {
                    name = ii;
                }
                var option = $('<option value="' + ii + '">' + name + '</option>');
                if (ii == FC.VTX_CONFIG.low_power_disarm) {
                    option.prop('selected', true);
                }
                option.appendTo(vtx_low_power_disarm);
            }
            vtx_low_power_disarm.on('change', function () {
                FC.VTX_CONFIG.low_power_disarm = parseInt($(this).val());
            });

            config_vtx.show();
        } else {
            config_vtx.hide();
        }

        // for some odd reason chrome 38+ changes scroll according to the touched select element
        // i am guessing this is a bug, since this wasn't happening on 37
        // code below is a temporary fix, which we will be able to remove in the future (hopefully)
        //noinspection JSValidateTypes
        $('#content').scrollTop((scrollPosition) ? scrollPosition : 0);

        // fill board alignment
        $('input[name="board_align_yaw"]').val((FC.BOARD_ALIGNMENT.yaw / 10.0).toFixed(1));

        // fill magnetometer
        //UPDATE: moved to GPS tab and hidden
        //$('#mag_declination').val(FC.MISC.mag_declination);

        // fill battery voltage
        $('#voltagesource').val(FC.MISC.voltage_source);
        $('#cells').val(FC.MISC.battery_cells);
        $('#celldetectvoltage').val(FC.MISC.vbatdetectcellvoltage);
        $('#mincellvoltage').val(FC.MISC.vbatmincellvoltage);
        $('#maxcellvoltage').val(FC.MISC.vbatmaxcellvoltage);
        $('#warningcellvoltage').val(FC.MISC.vbatwarningcellvoltage);
        $('#voltagescale').val(FC.MISC.vbatscale);

        // fill current
        $('#currentscale').val(FC.CURRENT_METER_CONFIG.scale);
        $('#currentoffset').val(FC.CURRENT_METER_CONFIG.offset / 10);

        // fill battery capacity
        $('#battery_capacity').val(FC.MISC.battery_capacity);
        let batCapWarn = Math.round(FC.MISC.battery_capacity_warning * 100 / FC.MISC.battery_capacity);
        $('#battery_capacity_warning').val(isNaN(batCapWarn) ? "" : batCapWarn);
        let batCapWarnCrit = Math.round(FC.MISC.battery_capacity_critical * 100 / FC.MISC.battery_capacity);
        $('#battery_capacity_critical').val(isNaN(batCapWarnCrit) ? "" : batCapWarnCrit);
        $('#battery_capacity_unit').val(FC.MISC.battery_capacity_unit);

        // Thermal Camera Configuration
        initializeThermalCamera();

        let $i2cSpeed = $('#i2c_speed'),
            $i2cSpeedInfo = $('#i2c_speed-info');

        $i2cSpeed.on('change', function () {
            let $this = $(this),
                value = $this.children("option:selected").text();

            if (value == "400KHZ") {

                $i2cSpeedInfo.removeClass('ok-box');
                $i2cSpeedInfo.addClass('info-box');
                $i2cSpeedInfo.removeClass('warning-box');

                $i2cSpeedInfo.html(i18n.getMessage('i2cSpeedSuggested800khz'));
                $i2cSpeedInfo.show();

            } else if (value == "800KHZ") {
                $i2cSpeedInfo.removeClass('ok-box');
                $i2cSpeedInfo.removeClass('info-box');
                $i2cSpeedInfo.removeClass('warning-box');
                $i2cSpeedInfo.hide();
            } else {
                $i2cSpeedInfo.removeClass('ok-box');
                $i2cSpeedInfo.removeClass('info-box');
                $i2cSpeedInfo.addClass('warning-box');
                $i2cSpeedInfo.html(i18n.getMessage('i2cSpeedTooLow'));
                $i2cSpeedInfo.show();
            }

        });

        $i2cSpeed.trigger('change');

        $('a.save').on('click', function () {
            //UPDATE: moved to GPS tab and hidden
            //FC.MISC.mag_declination = parseFloat($('#mag_declination').val());
            
            // First, update MZTC hidden fields based on port selection
            var mztcSelected = false;
            var mztcPort = 0;
            for (var portIndex = 0; portIndex < FC.SERIAL_CONFIG.ports.length; portIndex++) {
                var serialPort = FC.SERIAL_CONFIG.ports[portIndex];
                if (serialPort.functions.indexOf('MZTC_CAMERA') >= 0) {
                    mztcSelected = true;
                    // mztc_port is the zero-based serialPortIdentifier_e value
                    // that the firmware hands to openSerialPort().
                    mztcPort = serialPort.identifier;
                    break;
                }
            }
            
            // Set the hidden fields for Settings framework
            $('#mztc_enabled').val(mztcSelected ? 1 : 0);
            $('#mztc_port').val(mztcPort);
            console.log('Setting mztc_enabled hidden field to:', mztcSelected ? 1 : 0);
            console.log('Setting mztc_port hidden field to:', mztcPort);

            FC.MISC.battery_cells = parseInt($('#cells').val());
            FC.MISC.voltage_source = parseInt($('#voltagesource').val());
            FC.MISC.vbatdetectcellvoltage = parseFloat($('#celldetectvoltage').val());
            FC.MISC.vbatmincellvoltage = parseFloat($('#mincellvoltage').val());
            FC.MISC.vbatmaxcellvoltage = parseFloat($('#maxcellvoltage').val());
            FC.MISC.vbatwarningcellvoltage = parseFloat($('#warningcellvoltage').val());
            FC.MISC.vbatscale = parseInt($('#voltagescale').val());

            FC.MISC.battery_capacity = parseInt($('#battery_capacity').val());
            FC.MISC.battery_capacity_warning = parseInt($('#battery_capacity_warning').val() * FC.MISC.battery_capacity / 100);
            FC.MISC.battery_capacity_critical = parseInt($('#battery_capacity_critical').val() * FC.MISC.battery_capacity / 100);
            FC.MISC.battery_capacity_unit = $('#battery_capacity_unit').val();

            features.reset();
            features.fromUI($('.tab-configuration'));
            features.execute(function () {
                FC.CURRENT_METER_CONFIG.scale = parseInt($('#currentscale').val());
                FC.CURRENT_METER_CONFIG.offset = Math.round(parseFloat($('#currentoffset').val()) * 10);
                
                // Save MZTC configuration if MZTC_CONFIG exists
                if (FC.MZTC_CONFIG) {
                    // Check if MZTC_CAMERA is selected on any UART and auto-enable
                    var mztcSelected = false;
                    var selectedPort = 0;
                    var selectedBaudrate = 8; // Default to 115200
                    
                    for (var portIndex = 0; portIndex < FC.SERIAL_CONFIG.ports.length; portIndex++) {
                        var serialPort = FC.SERIAL_CONFIG.ports[portIndex];
                        if (serialPort.functions.indexOf('MZTC_CAMERA') >= 0) {
                            mztcSelected = true;
                            // mztc_port is the zero-based serialPortIdentifier_e
                            // value, so UART1 is 0 and UART2 is 1.
                            selectedPort = serialPort.identifier;
                            selectedBaudrate = serialPort.peripherals_baudrate;
                            break;
                        }
                    }
                    
                    // Automatically set enabled and port based on peripheral selection
                    if (mztcSelected) {
                        FC.MZTC_CONFIG.enabled = 1;
                        FC.MZTC_CONFIG.port = selectedPort;
                        FC.MZTC_CONFIG.baudrate = selectedBaudrate;
                        console.log('MZTC auto-enabled on port', selectedPort, 'with baudrate index', selectedBaudrate);
                        
                        // Get values from UI
                        FC.MZTC_CONFIG.mode = parseInt($('#mztc_mode').val());
                        FC.MZTC_CONFIG.brightness = parseInt($('#mztc_brightness').val());
                        FC.MZTC_CONFIG.contrast = parseInt($('#mztc_contrast').val());
                        FC.MZTC_CONFIG.palette_mode = parseInt($('#mztc_palette_mode').val());
                        FC.MZTC_CONFIG.zoom_level = parseInt($('#mztc_zoom_level').val());
                        FC.MZTC_CONFIG.auto_shutter = parseInt($('#mztc_auto_shutter').val());
                        FC.MZTC_CONFIG.ffc_interval = parseInt($('#mztc_ffc_interval').val());
                        
                        // Set defaults for fields not in UI
                        FC.MZTC_CONFIG.update_rate = FC.MZTC_CONFIG.update_rate || 9;
                        FC.MZTC_CONFIG.digital_enhancement = FC.MZTC_CONFIG.digital_enhancement || 50;
                        FC.MZTC_CONFIG.spatial_denoise = FC.MZTC_CONFIG.spatial_denoise || 50;
                        FC.MZTC_CONFIG.temporal_denoise = FC.MZTC_CONFIG.temporal_denoise || 50;
                        FC.MZTC_CONFIG.mirror_mode = FC.MZTC_CONFIG.mirror_mode || 0;
                        
                        // Temperature alerts temporarily disabled
                    } else {
                        // Disable if not selected
                        FC.MZTC_CONFIG.enabled = 0;
                        FC.MZTC_CONFIG.port = 0;
                    }
                }
                
                saveChainer.execute();
            });
        });
        interval.add('config_load_analog', function () {
            $('#batteryvoltage').val([FC.ANALOG.voltage.toFixed(2)]);
            $('#batterycurrent').val([FC.ANALOG.amperage.toFixed(2)]);
        }, 100, true); // 10 fps

        GUI.content_ready(callback);
    }
};

TABS.configuration.cleanup = function (callback) {
    if (callback) callback();
};

function initializeThermalCamera() {
    // Initialize MZTC_CONFIG with defaults if not present
    if (!FC.MZTC_CONFIG) {
        FC.MZTC_CONFIG = {
            enabled: 0,
            port: 0,
            baudrate: 8, // Index for 115200 baud
            mode: 1, // Standby
            update_rate: 9, // 9 Hz
            brightness: 50,
            contrast: 50,
            digital_enhancement: 50,
            spatial_denoise: 50,
            temporal_denoise: 50,
            palette_mode: 0,
            zoom_level: 0,
            mirror_mode: 0,
            auto_shutter: 2, // Time and Temperature
            crosshair_enabled: 0,
            ffc_interval: 5
        };
    }
    
    // Auto-enable and set port if MZTC_CAMERA is selected on any UART
    var mztcSelected = false;
    var selectedPort = 0;
    for (var portIndex = 0; portIndex < FC.SERIAL_CONFIG.ports.length; portIndex++) {
        var serialPort = FC.SERIAL_CONFIG.ports[portIndex];
        if (serialPort.functions.indexOf('MZTC_CAMERA') >= 0) {
            mztcSelected = true;
            // mztc_port is the zero-based serialPortIdentifier_e value.
            selectedPort = serialPort.identifier;
            break;
        }
    }
    
    // Automatically enable and set port based on peripheral selection
    if (mztcSelected) {
        FC.MZTC_CONFIG.enabled = 1;
        FC.MZTC_CONFIG.port = selectedPort;
        // Also set the hidden input fields for Settings framework
        $('#mztc_enabled').val(1);
        $('#mztc_port').val(selectedPort);
    } else {
        FC.MZTC_CONFIG.enabled = 0;
        FC.MZTC_CONFIG.port = 0;
        // Also set the hidden input fields for Settings framework
        $('#mztc_enabled').val(0);
        $('#mztc_port').val(0);
    }


    // Get baudrate from the selected port
    for (var portIndex = 0; portIndex < FC.SERIAL_CONFIG.ports.length; portIndex++) {
        var serialPort = FC.SERIAL_CONFIG.ports[portIndex];
        if (serialPort.functions.indexOf('MZTC_CAMERA') >= 0) {
            // Use the baudrate from the port configuration
            // Note: peripherals_baudrate is what's used for peripheral devices
            FC.MZTC_CONFIG.baudrate = serialPort.peripherals_baudrate;
            break;
        }
    }

    // Operating Mode
    var mztcMode = $('#mztc_mode');
    mztcMode.empty();
    $('<option value="0">Disabled</option>').appendTo(mztcMode);
    $('<option value="1">Standby</option>').appendTo(mztcMode);
    $('<option value="2">Continuous</option>').appendTo(mztcMode);
    $('<option value="3">Triggered</option>').appendTo(mztcMode);
    $('<option value="4">Alert</option>').appendTo(mztcMode);
    $('<option value="5">Recording</option>').appendTo(mztcMode);
    $('<option value="6">Calibration</option>').appendTo(mztcMode);
    $('<option value="7">Surveillance</option>').appendTo(mztcMode);
    mztcMode.val(FC.MZTC_CONFIG.mode);

    // Brightness
    $('#mztc_brightness').val(FC.MZTC_CONFIG.brightness);

    // Contrast
    $('#mztc_contrast').val(FC.MZTC_CONFIG.contrast);

    // Color Palette
    var mztcPalette = $('#mztc_palette_mode');
    mztcPalette.empty();
    $('<option value="0">White Hot</option>').appendTo(mztcPalette);
    $('<option value="1">Black Hot</option>').appendTo(mztcPalette);
    $('<option value="2">Fusion 1</option>').appendTo(mztcPalette);
    $('<option value="3">Rainbow</option>').appendTo(mztcPalette);
    $('<option value="4">Fusion 2</option>').appendTo(mztcPalette);
    $('<option value="5">Iron Red 1</option>').appendTo(mztcPalette);
    $('<option value="6">Iron Red 2</option>').appendTo(mztcPalette);
    $('<option value="7">Sepia</option>').appendTo(mztcPalette);
    $('<option value="8">Color 1</option>').appendTo(mztcPalette);
    $('<option value="9">Color 2</option>').appendTo(mztcPalette);
    $('<option value="10">Ice Fire</option>').appendTo(mztcPalette);
    $('<option value="11">Rain</option>').appendTo(mztcPalette);
    $('<option value="12">Green Hot</option>').appendTo(mztcPalette);
    $('<option value="13">Red Hot</option>').appendTo(mztcPalette);
    mztcPalette.val(FC.MZTC_CONFIG.palette_mode);

    // Zoom Level
    var mztcZoom = $('#mztc_zoom_level');
    mztcZoom.empty();
    $('<option value="0">1X</option>').appendTo(mztcZoom);
    $('<option value="1">2X</option>').appendTo(mztcZoom);
    $('<option value="2">4X</option>').appendTo(mztcZoom);
    $('<option value="3">8X</option>').appendTo(mztcZoom);
    mztcZoom.val(FC.MZTC_CONFIG.zoom_level);

    // Auto Shutter
    var mztcAutoShutter = $('#mztc_auto_shutter');
    mztcAutoShutter.empty();
    $('<option value="0">Temperature Only</option>').appendTo(mztcAutoShutter);
    $('<option value="1">Time Only</option>').appendTo(mztcAutoShutter);
    $('<option value="2">Time and Temperature</option>').appendTo(mztcAutoShutter);
    mztcAutoShutter.val(FC.MZTC_CONFIG.auto_shutter);
    
    // Add change handler to show/hide FFC interval based on auto shutter mode
    mztcAutoShutter.on('change', function() {
        var selectedMode = parseInt($(this).val());
        if (selectedMode === 0) { // Temperature Only
            $('.mztc_ffc_interval_wrapper').hide();
        } else {
            $('.mztc_ffc_interval_wrapper').show();
        }
    });

    // FFC Interval
    $('#mztc_ffc_interval').val(FC.MZTC_CONFIG.ffc_interval);
    
    // Hide FFC interval if auto shutter is temperature only
    if (FC.MZTC_CONFIG.auto_shutter === 0) {
        $('.mztc_ffc_interval_wrapper').hide();
    }

    // Show/hide thermal camera section based on serial port selection
    var configThermalCamera = $('.config-thermal-camera');
    if (mztcSelected) {
        configThermalCamera.show();
    } else {
        configThermalCamera.hide();
    }
}
