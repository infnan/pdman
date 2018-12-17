import React from 'react';
import _object from 'lodash/object';
import electron from 'electron';

import {Input, Icon, Button, Modal, RadioGroup, Select, openModal } from '../components';
import { uuid } from '../utils/uuid';

import './style/jdbc.less';

const { execFile } = require('child_process');

const { ipcRenderer } = electron;
const Radio = RadioGroup.Radio;

export default class JDBCConfig extends React.Component{
  constructor(props){
    super(props);
    this.split = process.platform === 'win32' ? '\\' : '/';
    const data = this._initData(props.data || []);
    this.state = {
      selectedTrs: this._getDefaultDBSelected(data),
      data,
      loading: false,
    };
  }
  _getDefaultDBSelected = (data) => {
    const defaultData = data.filter(d => d.defaultDB)[0] || data[0];
    return defaultData ? [defaultData.key] : [];
  };
  _initData = (data) => {
    return data.map(d => ({
      ...d,
      key: uuid(),
    }));
  };
  _trClick = (e, key) => {
    //e.stopPropagation();
    //e.preventDefault();
    const { selectedTrs } = this.state;
    let tempSelectedTrs = [...selectedTrs];
    if (tempSelectedTrs.some(tr => tr === key)) {
      tempSelectedTrs = e && e.shiftKey ? tempSelectedTrs.filter(tr => tr !== key) : [];
    } else {
      e && e.shiftKey ? tempSelectedTrs.push(key) : tempSelectedTrs = [key];
    }
    this.setState({
      selectedTrs: tempSelectedTrs,
    });
  };
  _deleteDB = () => {
    const { onChange } = this.props;
    const { data, selectedTrs } = this.state;
    let tempFields = [...(data || [])];
    const minIndex = Math.min(...tempFields
      .map((field, index) => {
        if (selectedTrs.includes(field.key)) {
          return index;
        }
        return null;
      }).filter(field => field !== null));
    const newFields = (data || []).filter(fid => !selectedTrs.includes(fid.key));
    const selectField = newFields[(minIndex - 1) < 0 ? 0 : minIndex - 1];
    this.setState({
      selectedTrs: (selectField && [selectField.key]) || [],
      data: newFields,
    }, () => {
      onChange && onChange(this.state.data.map(field => _object.omit(field, ['key'])));
    });
  };
  _addDB = () => {
    const { onChange } = this.props;
    const { data = [], selectedTrs } = this.state;
    const tempFields = [...data];
    const key = uuid();
    const selectedTrsIndex = tempFields
      .map((field, index) => {
        if (selectedTrs.includes(field.key)) {
          return index;
        }
        return null;
      }).filter(field => field !== null);
    const newField = {
      name: '',
      key: key,
      defaultDB: false,
    };
    if (selectedTrsIndex.length > 0) {
      tempFields.splice(Math.max(...selectedTrsIndex) + 1, 0, newField);
    } else {
      tempFields.push(newField);
    }
    this.setState({
      data: tempFields.map((f) => {
        if (f.key === key) {
          return {
            ...f,
            defaultDB: true,
          };
        }
        return {
          ...f,
          defaultDB: false,
        };
      }),
    }, () => {
      onChange && onChange(this.state.data.map(field => _object.omit(field, ['key'])));
      this._trClick(null, newField.key);
    });
  };
  _onDBChange = (key, e, name) => {
    const { onChange } = this.props;
    const { data } = this.state;
    this.setState({
      data: data.map((d) => {
        if (d.key === key) {
          return {
            ...d,
            [name]: e.target.value,
          };
        }
        return d;
      }),
    }, () => {
      onChange && onChange(this.state.data.map(field => _object.omit(field, ['key'])));
    });
  };
  _onChange = (name, e) => {
    const { onChange } = this.props;
    const { selectedTrs, data } = this.state;
    const key = selectedTrs[selectedTrs.length - 1];
    this.setState({
      data: data.map((d) => {
        if (d.key === key) {
          return {
            ...d,
            properties: {
              ...(d.properties || {}),
              [name]: (e.target.value || '').replace(/(^\s|\s$)/g, ''),
            },
          };
        }
        return d;
      }),
    }, () => {
      //console.log(this.state.data);
      onChange && onChange(this.state.data.map(field => _object.omit(field, ['key'])));
    });
  };
  _getParam = (selectJDBC) => {
    const paramArray = [];
    const properties = _object.get(selectJDBC, 'properties', {});
    Object.keys(properties).forEach((pro) => {
      //paramArray.push(`-${pro}`);
      paramArray.push(`${pro}=${properties[pro]}`);
    });
    //console.log(paramArray);
    return paramArray;
  };
  _getJAVAVersion = (java, cb) => {
    const minVersion = ['1', '8'];
    execFile(java, ['-version'],
      (error, stdout, stderr) => {
        if (error) {
          Modal.error({title: '获取JDK版本失败！', message: error.message || error});
          cb && cb(error);
        } else {
          // 1.截取第一行
          const version = stderr.split('\n')[0];
          const versionNumber = (version.match(/"(\S+)"/g)[0] || '');
          console.log(versionNumber);
          // 2.获取版本号的第一，第二位
          const currentVersion = (versionNumber.split('.') || []).map(v => v.replace('"', ''));
          let flag = false;
          if (currentVersion[0] === minVersion[0]) {
            // 如果版本号第一位相等
            flag = currentVersion[1] >= minVersion[1];
          } else {
            flag = currentVersion[0] >= minVersion[0];
          }
          cb && cb(null, flag, versionNumber);
        }
      });
  };
  _connectJDBC = (selectJDBC) => {
    this.setState({
      loading: true,
    });
    const { getJavaConfig } = this.props;
    const configData = (getJavaConfig && getJavaConfig()) || {};
    const value = configData.JAVA_HOME;
    const defaultPath = ipcRenderer.sendSync('jarPath');
    const jar = configData.DB_CONNECTOR || defaultPath;
    const tempValue = value ? `${value}${this.split}bin${this.split}java` : 'java';
    // 先判断当前的JAVA版本
    this._getJAVAVersion(tempValue, (versionError, flag, versionNumber) => {
      if (!versionError) {
        if (!flag) {
          Modal.error({
            title: '当前系统安装的JDK版本过低！',
            message: `当前版本：${versionNumber}，请安装JDK1.8及以上版本！`,
          });
          this.setState({
            loading: false,
          });
        } else {
          execFile(tempValue,
            [
              '-Dfile.encoding=utf-8',
              '-jar', jar, 'ping',
              ...this._getParam({
                ...selectJDBC,
                properties: {
                  ...(selectJDBC.properties || {}),
                },
              }),
            ],
            (error, stdout, stderr) => {
              const result = (stderr || stdout);
              this.setState({
                loading: false,
              });
              let tempResult = '';
              try {
                tempResult = JSON.parse(result);
              } catch (e) {
                tempResult = result;
              }
              if (tempResult.status !== 'SUCCESS') {
                Modal.error({title: '连接失败', message: tempResult.body || tempResult});
              } else {
                Modal.success({title: '连接成功', message: `${tempResult.body}!数据库连接设置配置正确`});
              }
            });
        }
      }
    });
  };
  _defaultDBChange = (value) => {
    const { data } = this.state;
    const { onChange } = this.props;
    this.setState({
      data: data.map((field) => {
      if (field.key === value) {
        return {...field, defaultDB: true};
      }
      return {...field, defaultDB: false};
      }),
    }, () => {
      onChange && onChange(this.state.data.map(field => _object.omit(field, ['key'])));
      this._trClick(null, value);
    });
  };
  _getData = () => {
    const { data } = this.state;
    return data.filter(d => d.defaultDB)[0];
  };
  _showHelp = () => {
    let modal = null;
    const onClickCancel = () => {
      modal && modal.close();
    };
    const mysqlString = 'jdbc:mysql://IP地址:端口号/数据库名?characterEncoding=UTF-8&useSSL=false&useUnicode=true'; // eslint-disable-line
    const oracle = 'jdbc:oracle:thin:@IP地址:端口号/数据库名';  // eslint-disable-line
    const SQLServer = 'jdbc:sqlserver://IP地址:端口号;DatabaseName=数据库名';
    const postgresql = 'jdbc:postgresql://IP地址:端口号/数据库名';
    modal = openModal(<div>
      <div style={{border: 'solid 1px green', padding: 5, margin: 5}}>
        <div style={{color: '#000000'}}>MYSQL配置示例：↓</div>
        <div style={{color: 'green'}}>driver_class：
          <span style={{color: 'red', userSelect: 'text'}}>com.mysql.jdbc.Driver</span>
        </div>
        <div style={{color: 'green'}}>url：<span style={{color: 'red', userSelect: 'text'}}>{mysqlString}</span></div>
      </div>
      <div style={{border: 'solid 1px green', padding: 5, margin: 5}}>
        <div style={{color: '#000000'}}>ORACLE配置示例：↓</div>
        <div style={{color: 'green'}}>driver_class：
          <span style={{color: 'red', userSelect: 'text'}}>oracle.jdbc.driver.OracleDriver</span>
        </div>
        <div style={{color: 'green'}}>url：<span style={{color: 'red', userSelect: 'text'}}>{oracle}</span></div>
      </div>
      <div style={{border: 'solid 1px green', padding: 5, margin: 5}}>
        <div style={{color: '#000000'}}>SQLServer配置示例：↓</div>
        <div style={{color: 'green'}}>driver_class：
          <span style={{color: 'red', userSelect: 'text'}}>com.microsoft.sqlserver.jdbc.SQLServerDriver</span>
        </div>
        <div style={{color: 'green'}}>url：<span style={{color: 'red', userSelect: 'text'}}>{SQLServer}</span></div>
      </div>
      <div style={{border: 'solid 1px green', padding: 5, margin: 5}}>
        <div style={{color: '#000000'}}>PostgreSQL配置示例：↓</div>
        <div style={{color: 'green'}}>driver_class：
          <span style={{color: 'red', userSelect: 'text'}}>org.postgresql.Driver</span>
        </div>
        <div style={{color: 'green'}}>url：<span style={{color: 'red', userSelect: 'text'}}>{postgresql}</span></div>
      </div>
    </div>, {
      title: 'JDBC配置示例',
      footer: [<Button key="cancel" onClick={onClickCancel} style={{ marginLeft: 10 }}>关闭</Button>],
    });
  };
  render(){
    const { dataSource } = this.props;
    const { selectedTrs, data } = this.state;
    // properties
    let selectJDBC = {};
    if (selectedTrs.length > 0) {
      const key = selectedTrs[selectedTrs.length - 1];
      selectJDBC = data.filter(d => d.key === key)[0] || {};
    }
    const defaultDB = this._getData();
    const database = _object.get(dataSource, 'dataTypeDomains.database', []);
    return (<div className='pdman-jdbc-config'>
      <div className='pdman-jdbc-config-left'>
        <div className='pdman-jdbc-config-left-db-opt'>
          <Icon
            onClick={() => selectedTrs.length !== 0 && this._deleteDB()}
            className={selectedTrs.length === 0 ?
              'pdman-data-table-content-table-disabled-icon'
              : 'pdman-data-table-content-table-normal-icon'}
            type="fa-minus"
          />
          <Icon
            onClick={() => this._addDB()}
            className='pdman-data-table-content-table-normal-icon'
            type="fa-plus"
          />
          <span>{defaultDB ? `当前数据库版本使用的数据库为【${defaultDB.name}】` : '当前数据库版本未选择默认数据库'}</span>
        </div>
        <div className='pdman-jdbc-config-left-db-list'>
          {
            data.map((d, index) => (
              <div
                className={`pdman-jdbc-config-left-db-list-item pdman-data-table-content-table-normal-tr
                        ${selectedTrs.some(tr => tr === d.key) ? 'pdman-data-table-content-table-selected-tr' : ''}`}
                key={d.key}
              >
                <RadioGroup
                  name='defaultDB'
                  title='选择默认版本管理的数据库'
                  value={defaultDB && defaultDB.key || selectedTrs[0]}
                  onChange={this._defaultDBChange}
                >
                  <Radio
                    wrapperStyle={{width: 28}}
                    value={d.key}
                    radioStyle={{width: '98%'}}
                    //onClick={e => this._trClick(e, d.key)}
                  >
                    <span
                      className='pdman-jdbc-config-left-db-list-item-index'
                    >{index + 1}</span>
                    <Input onChange={e => this._onDBChange(d.key, e, 'name')} value={d.name}/>
                    <Select onChange={e => this._onDBChange(d.key, e, 'type')} defaultValue={d.type}>
                      {
                        database
                          .map(db => (<option key={db.code} value={db.code}>{db.code}</option>))
                      }
                    </Select>
                  </Radio>
                </RadioGroup>
              </div>
            ))
          }
        </div>
      </div>
      <div className='pdman-jdbc-config-right' style={{display: selectedTrs.length > 0 ? '' : 'none'}}>
        <div className='pdman-jdbc-config-right-com'>
          <div className='pdman-jdbc-config-right-com-label'>
            <span>
              <span
                onClick={this._showHelp}
                title='点击查看帮助'
                style={{marginRight: 10, color: 'green', cursor: 'pointer'}}
              >
                ?
              </span>
              driver-class:</span>
          </div>
          <div className='pdman-jdbc-config-right-com-input'>
            <input
              onChange={e => this._onChange('driver_class_name', e)}
              value={_object.get(selectJDBC, 'properties.driver_class_name', '')}
            />
          </div>
        </div>
        <div className='pdman-jdbc-config-right-com'>
          <div className='pdman-jdbc-config-right-com-label'>
            <span>
              <span
                onClick={this._showHelp}
                title='点击查看帮助'
                style={{marginRight: 10, color: 'green', cursor: 'pointer'}}
              >
                ?
              </span>
              url:</span>
          </div>
          <div className='pdman-jdbc-config-right-com-input'>
            <input
              onChange={e => this._onChange('url', e)}
              value={_object.get(selectJDBC, 'properties.url', '')}
            />
          </div>
        </div>
        <div className='pdman-jdbc-config-right-com'>
          <div className='pdman-jdbc-config-right-com-label'>
            <span>username:</span>
          </div>
          <div className='pdman-jdbc-config-right-com-input'>
            <input
              onChange={e => this._onChange('username', e)}
              value={_object.get(selectJDBC, 'properties.username', '')}
            />
          </div>
        </div>
        <div className='pdman-jdbc-config-right-com'>
          <div className='pdman-jdbc-config-right-com-label'>
            <span>password:</span>
          </div>
          <div className='pdman-jdbc-config-right-com-input'>
            <input
              onChange={e => this._onChange('password', e)}
              value={_object.get(selectJDBC, 'properties.password', '')}
            />
          </div>
        </div>
        <div className='pdman-jdbc-config-right-com'>
          <div className='pdman-jdbc-config-right-com-button-test'>
            <Button
              loading={this.state.loading}
              onClick={() => this._connectJDBC(selectJDBC)}
            >
              {this.state.loading ? '正在连接' : '测试'}
            </Button>
          </div>
        </div>
      </div>
    </div>);
  }
}
